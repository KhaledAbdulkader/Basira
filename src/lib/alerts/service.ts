import type { Alert, Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  BusinessError,
  getOwnedBusiness,
  lockOwnedBusiness,
} from "@/lib/business/service";
import { Decimal } from "@/lib/records/money";
import { dateOnly } from "@/lib/records/dates";
import {
  RULES,
  alertIdSchema,
  alertListSchema,
  emptyActionSchema,
  updateAlertSchema,
  updateRuleSchema,
  type AlertView,
  type AlertEvidence,
} from "./contracts";
import { evaluateAlertsInTransaction, readRules } from "./evaluation";

const transactionOptions = { maxWait: 10000, timeout: 20000 };
function alertView(row: Alert): AlertView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    status: row.status,
    version: row.version,
    periodFrom: dateOnly(row.periodFrom),
    periodTo: dateOnly(row.periodTo),
    evidence: row.evidence as AlertEvidence,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
  };
}
async function summary(tx: Prisma.TransactionClient, businessId: string) {
  const groups = await tx.alert.groupBy({
    by: ["status"],
    where: { businessId },
    _count: { _all: true },
  });
  const count = (status: Alert["status"]) =>
    groups.find((g) => g.status === status)?._count._all ?? 0;
  return {
    unread: count("UNREAD"),
    read: count("READ"),
    dismissed: count("DISMISSED"),
  };
}
export async function getAlertSummary(
  db: PrismaClient,
  actorId: string,
  businessId: string,
) {
  return db.$transaction(
    async (tx) => {
      await getOwnedBusiness(tx, actorId, businessId);
      return summary(tx, businessId);
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function listAlertRules(
  db: PrismaClient,
  actorId: string,
  businessId: string,
) {
  return db.$transaction(
    async (tx) => {
      await getOwnedBusiness(tx, actorId, businessId);
      return readRules(tx, businessId);
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function evaluateAlerts(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown = {},
  now = new Date(),
) {
  emptyActionSchema.parse(input);
  return db.$transaction(
    (tx) => evaluateAlertsInTransaction(tx, actorId, businessId, now),
    transactionOptions,
  );
}
export async function getAlerts(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown = {},
  now = new Date(),
) {
  const query = alertListSchema.parse(input);
  return db.$transaction(async (tx) => {
    const evaluated = await evaluateAlertsInTransaction(
      tx,
      actorId,
      businessId,
      now,
    );
    const where = {
      businessId,
      ...(query.status === "ALL" ? {} : { status: query.status }),
      ...(query.type === "ALL" ? {} : { type: query.type }),
    };
    const [rows, total, counts] = await Promise.all([
      tx.alert.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * 20,
        take: 20,
      }),
      tx.alert.count({ where }),
      summary(tx, businessId),
    ]);
    return {
      ...evaluated,
      items: rows.map(alertView),
      total,
      counts,
      page: query.page,
      pageSize: 20,
      status: query.status,
      type: query.type,
    };
  }, transactionOptions);
}
export async function getRecentAlerts(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const evaluated = await evaluateAlertsInTransaction(
      tx,
      actorId,
      businessId,
      now,
    );
    const rows = await tx.alert.findMany({
      where: { businessId, status: { not: "DISMISSED" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
    });
    return {
      items: rows.map(alertView),
      counts: await summary(tx, businessId),
      period: evaluated.period,
    };
  }, transactionOptions);
}
export async function updateAlertRule(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  input: unknown,
  now = new Date(),
) {
  const request = updateRuleSchema.parse(input),
    ruleId = alertIdSchema.parse(id);
  return db.$transaction(async (tx) => {
    await lockOwnedBusiness(tx, actorId, businessId);
    const rule = await tx.alertRule.findFirst({
      where: { id: ruleId, businessId },
    });
    if (!rule) throw new BusinessError(404, "Alert rule not found.");
    if (rule.version !== request.version)
      throw new BusinessError(409, "This rule changed. Reload before saving.");
    const threshold = new Decimal(request.threshold),
      limits = RULES[rule.type];
    if (threshold.lt(limits.min) || threshold.gt(limits.max))
      throw new BusinessError(
        422,
        `Use a threshold between ${limits.min}% and ${limits.max}%.`,
      );
    await tx.alertRule.update({
      where: { id: rule.id },
      data: { enabled: request.enabled, threshold, version: { increment: 1 } },
    });
    return evaluateAlertsInTransaction(tx, actorId, businessId, now);
  }, transactionOptions);
}
export async function updateAlertStatus(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  id: string,
  input: unknown,
  now = new Date(),
) {
  const request = updateAlertSchema.parse(input),
    alertId = alertIdSchema.parse(id);
  return db.$transaction(async (tx) => {
    await lockOwnedBusiness(tx, actorId, businessId);
    const row = await tx.alert.findFirst({
      where: { id: alertId, businessId },
    });
    if (!row) throw new BusinessError(404, "Alert not found.");
    if (row.status === request.status) return alertView(row);
    if (row.version !== request.version)
      throw new BusinessError(
        409,
        "This alert changed. Reload before updating it.",
      );
    if (row.status === "DISMISSED")
      throw new BusinessError(409, "This alert is already dismissed.");
    return alertView(
      await tx.alert.update({
        where: { id: row.id },
        data: {
          status: request.status,
          version: { increment: 1 },
          ...(request.status === "READ"
            ? { readAt: now }
            : { dismissedAt: now }),
        },
      }),
    );
  });
}
export async function markAllAlertsRead(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
  now = new Date(),
) {
  emptyActionSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockOwnedBusiness(tx, actorId, businessId);
    const result = await tx.alert.updateMany({
      where: { businessId, status: "UNREAD" },
      data: { status: "READ", readAt: now, version: { increment: 1 } },
    });
    return { changed: result.count };
  });
}
export type AlertsWorkspace = Awaited<ReturnType<typeof getAlerts>>;
