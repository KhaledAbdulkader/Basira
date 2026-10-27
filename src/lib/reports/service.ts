import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type Report,
} from "@/generated/prisma/client";
import {
  getOwnedBusiness,
  lockOwnedBusiness,
  lockFinancialSettings,
  BusinessError,
} from "@/lib/business/service";
import { dateOnly, parseDate } from "@/lib/records/dates";
import { buildAssistantContext } from "@/lib/assistant/context";
import { ProviderError } from "@/lib/ai/nvidia";
import { RequestError } from "@/lib/http/request";
import {
  createReportSchema,
  reportListSchema,
  reportIdSchema,
  summaryRequestSchema,
  reportSummarySchema,
  REPORT_COOLDOWN_MS,
  REPORT_LEASE_MS,
  type ReportSnapshot,
  type ReportView,
} from "./contracts";
import { reportPeriod } from "./period";
import { deterministicSummary } from "./summary";
import type { ReportSummarizer } from "./provider";

const transactionOptions = { maxWait: 10000, timeout: 20000 };
const listing = {
  id: true,
  reportType: true,
  periodStart: true,
  periodEnd: true,
  createdAt: true,
  businessName: true,
  currency: true,
  timezone: true,
  summary: true,
  aiStatus: true,
  aiSummary: true,
  aiError: true,
  aiModel: true,
  aiCompletedAt: true,
  aiLeaseUntil: true,
} as const;
function view(
  row: Prisma.ReportGetPayload<{ select: typeof listing }>,
  now: Date,
): ReportView {
  return {
    id: row.id,
    reportType: row.reportType,
    from: dateOnly(row.periodStart),
    to: dateOnly(row.periodEnd),
    createdAt: row.createdAt.toISOString(),
    businessName: row.businessName,
    currency: row.currency,
    timezone: row.timezone,
    summary: row.summary,
    aiStatus: row.aiStatus,
    aiSummary: row.aiSummary,
    aiError: row.aiError,
    aiModel: row.aiModel,
    aiCompletedAt: row.aiCompletedAt?.toISOString() ?? null,
    retryable:
      row.aiStatus === "NOT_REQUESTED" ||
      row.aiStatus === "FAILED" ||
      (row.aiStatus === "PENDING" &&
        (!row.aiLeaseUntil || row.aiLeaseUntil <= now)),
  };
}
function detail(row: Report, now: Date) {
  const snapshot = row.snapshot as unknown as ReportSnapshot;
  if (snapshot.schemaVersion !== 1)
    throw new RequestError(503, "This report version cannot be opened.");
  return { ...view(row, now), snapshot };
}
async function ownedReport(
  tx: Prisma.TransactionClient,
  actorId: string,
  businessId: string,
  id: string,
) {
  await getOwnedBusiness(tx, actorId, businessId);
  const row = await tx.report.findFirst({
    where: { businessId, id: reportIdSchema.parse(id) },
  });
  if (!row) throw new BusinessError(404, "Report not found.");
  return row;
}
export async function createReport(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
  now = new Date(),
) {
  const request = createReportSchema.parse(input);
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        type: request.reportType,
        from: request.from ?? null,
        to: request.to ?? null,
      }),
    )
    .digest("hex");
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const business = await lockOwnedBusiness(tx, actorId, businessId);
          const existing = await tx.report.findUnique({
            where: {
              businessId_requestId: {
                businessId,
                requestId: request.requestId,
              },
            },
          });
          if (existing) {
            if (existing.requestHash !== requestHash)
              throw new BusinessError(
                409,
                "This request already created a different report. Start a new request.",
              );
            return { report: detail(existing, now), alreadyGenerated: true };
          }
          const range = reportPeriod(request, business.timezone, now);
          const context = await buildAssistantContext(
            tx,
            actorId,
            businessId,
            range,
            now,
          );
          const content = deterministicSummary(context);
          const snapshot: ReportSnapshot = {
            schemaVersion: 1,
            businessName: business.name,
            reportType: request.reportType,
            context,
            observations: content.observations,
          };
          if (Buffer.byteLength(JSON.stringify(snapshot)) > 65536)
            throw new BusinessError(
              422,
              "The report summary is too large. Choose a shorter period.",
            );
          await lockFinancialSettings(tx, actorId, businessId);
          const row = await tx.report.create({
            data: {
              businessId,
              requestId: request.requestId,
              requestHash,
              reportType: request.reportType,
              periodStart: parseDate(range.from),
              periodEnd: parseDate(range.to),
              businessName: business.name,
              currency: business.currency,
              timezone: business.timezone,
              summary: content.summary,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              createdAt: now,
            },
          });
          return { report: detail(row, now), alreadyGenerated: false };
        },
        { ...transactionOptions, isolationLevel: "RepeatableRead" },
      );
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        continue;
      throw error;
    }
  }
}
export async function getReport(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  now = new Date(),
) {
  return db.$transaction(
    async (tx) => detail(await ownedReport(tx, actorId, businessId, id), now),
    { isolationLevel: "RepeatableRead" },
  );
}
export async function listReports(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown = {},
  now = new Date(),
) {
  const query = reportListSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await getOwnedBusiness(tx, actorId, businessId);
      const where = {
        businessId,
        ...(query.type === "ALL" ? {} : { reportType: query.type }),
      };
      const [rows, total] = await Promise.all([
        tx.report.findMany({
          where,
          select: listing,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * 20,
          take: 20,
        }),
        tx.report.count({ where }),
      ]);
      return {
        items: rows.map((row) => view(row, now)),
        total,
        page: query.page,
        pageSize: 20,
        type: query.type,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function summarizeReport(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  input: unknown,
  factory: () => ReportSummarizer,
  clock = () => new Date(),
) {
  summaryRequestSchema.parse(input);
  const claim = await db.$transaction(async (tx) => {
    const business = await lockOwnedBusiness(tx, actorId, businessId);
    const row = await ownedReport(tx, actorId, businessId, id),
      now = clock();
    if (row.aiStatus === "COMPLETED") return { row, token: null };
    if (
      row.aiStatus === "PENDING" &&
      row.aiLeaseUntil &&
      row.aiLeaseUntil > now
    )
      throw new BusinessError(
        409,
        "The AI summary is still running. Refresh shortly; the saved report is already available.",
      );
    if (business.reportSummaryNextAt && business.reportSummaryNextAt > now)
      throw new RequestError(
        429,
        "Wait one minute between AI report summaries for this business.",
      );
    const token = randomUUID();
    await tx.business.update({
      where: { id: businessId },
      data: {
        reportSummaryNextAt: new Date(now.getTime() + REPORT_COOLDOWN_MS),
      },
    });
    await tx.report.update({
      where: { id: row.id },
      data: {
        aiStatus: "PENDING",
        aiSummary: null,
        aiError: null,
        aiCompletedAt: null,
        aiAttempts: { increment: 1 },
        aiLeaseToken: token,
        aiLeaseUntil: new Date(now.getTime() + REPORT_LEASE_MS),
      },
    });
    return { row, token };
  }, transactionOptions);
  if (!claim.token) return detail(claim.row, clock());
  let summary: string | null = null,
    errorCode: ProviderError["code"] | null = null,
    provider: ReportSummarizer | null = null;
  try {
    provider = factory();
    const result = await provider.summarize(
      (claim.row.snapshot as unknown as ReportSnapshot).context,
    );
    summary = reportSummarySchema.parse(result).summary;
  } catch (error) {
    errorCode =
      error instanceof ProviderError ? error.code : "INVALID_RESPONSE";
  }
  return db.$transaction(async (tx) => {
    await lockOwnedBusiness(tx, actorId, businessId);
    const now = clock();
    await tx.report.updateMany({
      where: {
        id: claim.row.id,
        businessId,
        aiStatus: "PENDING",
        aiLeaseToken: claim.token,
        aiLeaseUntil: { gt: now },
      },
      data: {
        aiStatus: summary ? "COMPLETED" : "FAILED",
        aiSummary: summary,
        aiError: summary ? null : (errorCode ?? "UNAVAILABLE"),
        aiCompletedAt: summary ? now : null,
        aiLeaseToken: null,
        aiLeaseUntil: null,
        aiProvider: provider?.provider ?? null,
        aiModel: provider?.model ?? null,
        aiPromptVersion: provider?.promptVersion ?? null,
      },
    });
    return detail(await ownedReport(tx, actorId, businessId, id), now);
  }, transactionOptions);
}
