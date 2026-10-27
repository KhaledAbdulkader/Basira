import type { Prisma } from "@/generated/prisma/client";
import { getOwnedBusiness } from "@/lib/business/service";
import { readDashboardSnapshot } from "@/lib/dashboard/service";
import { dateOnly, parseDate } from "@/lib/records/dates";
import { TOPICS } from "@/lib/feedback/contracts";

export async function buildAssistantContext(
  tx: Prisma.TransactionClient,
  actorId: string,
  businessId: string,
  range: { from: string; to: string },
  now: Date,
) {
  const business = await getOwnedBusiness(tx, actorId, businessId);
  const dashboard = await readDashboardSnapshot(
    tx,
    actorId,
    businessId,
    { period: "custom", ...range },
    now,
  );
  const topicGroups = await tx.customerFeedback.groupBy({
    by: ["topic", "sentiment"],
    _count: { _all: true },
    where: {
      businessId,
      feedbackDate: { gte: parseDate(range.from), lte: parseDate(range.to) },
      analysisStatus: "ANALYZED",
      topic: { in: [...TOPICS] },
    },
  });
  const forecasts = await tx.forecastRun.findMany({
    where: { businessId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 3,
    select: {
      metricType: true,
      horizon: true,
      currency: true,
      forecastStart: true,
      forecastEnd: true,
      trainingEnd: true,
      total: true,
      mae: true,
      mape: true,
      gapDays: true,
      gapsConfirmed: true,
      createdAt: true,
    },
  });
  const warnings: string[] = [];
  const alerts = await tx.alert.findMany({
    where: { businessId, status: { not: "DISMISSED" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      type: true,
      title: true,
      message: true,
      status: true,
      severity: true,
      periodFrom: true,
      periodTo: true,
      createdAt: true,
    },
  });
  if (!dashboard.hasFinancialRecords)
    warnings.push(
      "There are no financial records in the selected period. Zero recorded totals do not prove zero activity.",
    );
  if (dashboard.current.costMissing || dashboard.previous.costMissing)
    warnings.push(
      "Some sales lack historical costs. Estimated profit and margin may be overstated; compare both periods' cost coverage.",
    );
  if (dashboard.current.customerDays < dashboard.period.current.days)
    warnings.push(
      "Customer-visit coverage is incomplete. Missing days are unknown; visit totals are not unique customers or a retention rate.",
    );
  if (dashboard.sentiment.unknown)
    warnings.push(
      "Pending and failed feedback is excluded from analyzed sentiment and topic conclusions.",
    );
  if (range.to === dashboard.period.today)
    warnings.push(
      "The selected period includes today, which may be incomplete.",
    );
  if (forecasts.length)
    warnings.push(
      "Forecasts are saved estimates with their own dates. Later record edits do not update them; they are not guaranteed outcomes.",
    );
  const stripIds = (items: typeof dashboard.topRevenue) =>
    items.map(({ name, revenue, quantity, transactions }) => ({
      name,
      revenue,
      quantity,
      transactions,
    }));
  return {
    capturedAt: now.toISOString(),
    business: {
      type: business.businessType,
      otherType: business.otherBusinessType,
      currency: business.currency,
      timezone: business.timezone,
    },
    period: dashboard.period.current,
    comparisonPeriod: dashboard.period.previous,
    current: dashboard.current,
    previous: dashboard.previous,
    comparison: dashboard.comparison,
    topProductsByRevenue: stripIds(dashboard.topRevenue),
    topProductsByQuantity: stripIds(dashboard.bestSelling),
    expenseBreakdown: dashboard.categories,
    sentiment: dashboard.sentiment,
    feedbackTopics: TOPICS.map((topic) => {
      const rows = topicGroups.filter((row) => row.topic === topic);
      return {
        topic,
        positive: rows
          .filter((r) => r.sentiment === "POSITIVE")
          .reduce((n, r) => n + r._count._all, 0),
        neutral: rows
          .filter((r) => r.sentiment === "NEUTRAL")
          .reduce((n, r) => n + r._count._all, 0),
        negative: rows
          .filter((r) => r.sentiment === "NEGATIVE")
          .reduce((n, r) => n + r._count._all, 0),
      };
    }).filter((t) => t.positive + t.neutral + t.negative > 0),
    forecasts: forecasts.map((f) => ({
      metric: f.metricType,
      horizon: f.horizon,
      currency: f.currency,
      from: dateOnly(f.forecastStart),
      to: dateOnly(f.forecastEnd),
      trainingEnd: dateOnly(f.trainingEnd),
      total: f.total.toFixed(),
      mae: f.mae.toFixed(),
      mape: f.mape?.toFixed() ?? null,
      gapDays: f.gapDays,
      gapsConfirmed: f.gapsConfirmed,
      createdAt: f.createdAt.toISOString(),
    })),
    recentAlerts: alerts.map((a) => ({
      type: a.type,
      title: a.title,
      message: a.message,
      status: a.status,
      severity: a.severity,
      from: dateOnly(a.periodFrom),
      to: dateOnly(a.periodTo),
      createdAt: a.createdAt.toISOString(),
    })),
    availability: {
      alerts: "Latest five non-dismissed historical alerts, across all dates",
      rawTransactions: "Not provided",
      individualFeedback: "Not provided",
      externalResearch: "Not provided",
    },
    warnings,
  };
}
export type AssistantContext = Awaited<
  ReturnType<typeof buildAssistantContext>
>;
export type HistoryMessage = { role: "USER" | "ASSISTANT"; content: string };
// Preserve complete recent pairs; never send an orphan answer or unlimited history.
export function boundedHistory(
  rows: {
    role: "USER" | "ASSISTANT";
    status: string;
    turnId: string;
    content: string;
  }[],
): HistoryMessage[] {
  const selected: HistoryMessage[][] = [];
  let characters = 0;
  for (let i = rows.length - 1; i >= 1; i -= 2) {
    const answer = rows[i]!,
      question = rows[i - 1]!;
    if (
      question.role !== "USER" ||
      answer.role !== "ASSISTANT" ||
      question.turnId !== answer.turnId ||
      answer.status !== "COMPLETED"
    )
      continue;
    const length = question.content.length + answer.content.length;
    if (characters + length > 8000 || selected.length === 3) break;
    selected.push([
      { role: "USER", content: question.content },
      { role: "ASSISTANT", content: answer.content },
    ]);
    characters += length;
  }
  return selected.reverse().flat();
}
