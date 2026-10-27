import { randomUUID } from "node:crypto";
import { evaluateAlertsInTransaction } from "@/lib/alerts/evaluation";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  BusinessError,
  getOwnedBusiness,
  lockOwnedBusiness,
} from "@/lib/business/service";
import {
  AnalysisError,
  analysisSchema,
  analyzeRequestSchema,
  BATCH_SIZE,
  COOLDOWN_MS,
  LEASE_MS,
  SENTIMENTS,
  TOPICS,
  type AnalysisBatchResult,
  type FeedbackInsights,
} from "./contracts";
import type { FeedbackAnalyzer } from "./provider";

export async function analyzeFeedback(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
  createAnalyzer: () => FeedbackAnalyzer,
  clock: () => Date = () => new Date(),
): Promise<AnalysisBatchResult> {
  const request = analyzeRequestSchema.parse(input);
  // Claim under the same lock used by feedback edits/deletion. No network I/O in this transaction.
  const claim = await db.$transaction(async (tx) => {
    const business = await lockOwnedBusiness(tx, actorId, businessId);
    const now = clock();
    if (
      business.feedbackAnalysisNextAt &&
      business.feedbackAnalysisNextAt > now
    )
      throw new BusinessError(
        409,
        "Wait one minute between analysis batches, then try again.",
      );
    if (
      await tx.customerFeedback.count({
        where: { businessId, analysisLeaseUntil: { gt: now } },
      })
    )
      throw new BusinessError(
        409,
        "Analysis is already running. Refresh shortly; interrupted requests become available within 150 seconds.",
      );
    const rows = await tx.customerFeedback.findMany({
      where: {
        businessId,
        ...(request.mode === "SINGLE"
          ? { id: request.recordId }
          : { analysisStatus: request.mode }),
      },
      orderBy: [{ feedbackDate: "asc" }, { id: "asc" }],
      take: request.mode === "SINGLE" ? 1 : BATCH_SIZE,
    });
    if (request.mode === "SINGLE") {
      if (!rows.length) throw new BusinessError(404, "Feedback not found.");
      if (rows[0]!.version !== request.version)
        throw new BusinessError(
          409,
          "This feedback changed. Reload before analyzing it.",
        );
      if (rows[0]!.analysisStatus === "ANALYZED")
        throw new BusinessError(409, "This feedback is already analyzed.");
    }
    if (!rows.length) return null;
    const analyzer = createAnalyzer();
    const token = randomUUID();
    const nextAllowedAt = new Date(now.getTime() + COOLDOWN_MS);
    await tx.business.update({
      where: { id: businessId },
      data: { feedbackAnalysisNextAt: nextAllowedAt },
    });
    await tx.customerFeedback.updateMany({
      where: { businessId, id: { in: rows.map((row) => row.id) } },
      data: {
        analysisStatus: "PENDING",
        sentiment: "UNKNOWN",
        topic: null,
        aiSummary: null,
        confidence: null,
        analysisError: null,
        analyzedAt: null,
        analysisProvider: analyzer.provider,
        analysisModel: analyzer.model,
        analysisPromptVersion: analyzer.promptVersion,
        analysisAttemptedAt: now,
        analysisAttempts: { increment: 1 },
        analysisLeaseToken: token,
        analysisLeaseUntil: new Date(now.getTime() + LEASE_MS),
      },
    });
    return { rows, token, analyzer, nextAllowedAt };
  });
  if (!claim)
    return {
      attempted: 0,
      analyzed: 0,
      failed: 0,
      skipped: 0,
      nextAllowedAt: null,
    };
  const results = await Promise.allSettled(
    claim.rows.map(async (row) => {
      let result: ReturnType<typeof analysisSchema.parse> | undefined;
      let failure: AnalysisError | undefined;
      try {
        const response = analysisSchema.safeParse(
          await claim.analyzer.analyze(row.feedbackText),
        );
        if (!response.success) throw new AnalysisError("INVALID_RESPONSE");
        result = response.data;
      } catch (error) {
        failure =
          error instanceof AnalysisError
            ? error
            : new AnalysisError("UNAVAILABLE");
      }
      return db.$transaction(
        async (tx) => {
          await lockOwnedBusiness(tx, actorId, businessId);
          const changed = await tx.customerFeedback.updateMany({
            where: {
              id: row.id,
              businessId,
              version: row.version,
              analysisLeaseToken: claim.token,
              analysisLeaseUntil: { gt: clock() },
            },
            data: {
              analysisLeaseToken: null,
              analysisLeaseUntil: null,
              version: { increment: 1 },
              ...(result
                ? {
                    analysisStatus: "ANALYZED",
                    sentiment: result.sentiment,
                    topic: result.topic,
                    aiSummary: result.summary,
                    confidence: result.confidence,
                    analyzedAt: clock(),
                    analysisError: null,
                  }
                : { analysisStatus: "FAILED", analysisError: failure!.code }),
            },
          });
          if (changed.count)
            await evaluateAlertsInTransaction(tx, actorId, businessId, clock());
          return changed.count ? (result ? "analyzed" : "failed") : "skipped";
        },
        { maxWait: 10000, timeout: 20000 },
      );
    }),
  );
  const counts: AnalysisBatchResult = {
    attempted: claim.rows.length,
    analyzed: 0,
    failed: 0,
    skipped: 0,
    nextAllowedAt: claim.nextAllowedAt.toISOString(),
  };
  // Wait for every in-flight operation even when access changes or the database fails.
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    counts[result.value]++;
  }
  return counts;
}

export async function getFeedbackInsights(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  now = new Date(),
): Promise<FeedbackInsights> {
  return db.$transaction(
    async (tx) => {
      const business = await getOwnedBusiness(tx, actorId, businessId);
      const [groups, topicGroups, inProgress] = await Promise.all([
        tx.customerFeedback.groupBy({
          by: ["analysisStatus", "sentiment"],
          where: { businessId },
          _count: { _all: true },
        }),
        tx.customerFeedback.groupBy({
          by: ["topic", "sentiment"],
          where: {
            businessId,
            analysisStatus: "ANALYZED",
            sentiment: { in: [...SENTIMENTS] },
            topic: { in: [...TOPICS] },
          },
          _count: { _all: true },
        }),
        tx.customerFeedback.count({
          where: { businessId, analysisLeaseUntil: { gt: now } },
        }),
      ]);
      const total = groups.reduce((sum, g) => sum + g._count._all, 0);
      const counts = SENTIMENTS.map((sentiment) => ({
        sentiment,
        count: groups
          .filter(
            (g) => g.analysisStatus === "ANALYZED" && g.sentiment === sentiment,
          )
          .reduce((sum, g) => sum + g._count._all, 0),
      }));
      const analyzed = counts.reduce((sum, g) => sum + g.count, 0);
      const failed = groups
        .filter((g) => g.analysisStatus === "FAILED")
        .reduce((sum, g) => sum + g._count._all, 0);
      const topics = TOPICS.map((topic) => {
        const items = topicGroups.filter((g) => g.topic === topic);
        return {
          topic,
          count: items.reduce((sum, g) => sum + g._count._all, 0),
          positive: items
            .filter((g) => g.sentiment === "POSITIVE")
            .reduce((sum, g) => sum + g._count._all, 0),
          negative: items
            .filter((g) => g.sentiment === "NEGATIVE")
            .reduce((sum, g) => sum + g._count._all, 0),
        };
      })
        .filter((g) => g.count > 0)
        .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
      return {
        total,
        analyzed,
        pending: total - analyzed - failed,
        failed,
        inProgress,
        nextAllowedAt: business.feedbackAnalysisNextAt?.toISOString() ?? null,
        sentiments: counts.map((g) => ({
          ...g,
          percent: analyzed
            ? Math.round((g.count / analyzed) * 1000) / 10
            : null,
        })),
        topics,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
