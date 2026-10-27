import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { lockOwnedBusiness } from "@/lib/business/service";
import { readDashboardSnapshot } from "@/lib/dashboard/service";
import { addDays } from "@/lib/dashboard/period";
import { parseDate, dateOnly } from "@/lib/records/dates";
import { dateSchema } from "@/lib/validation/records";
import { Decimal } from "@/lib/records/money";
import { alertPeriod, evaluateRules, type ForecastBasis } from "./engine";
import { ALERT_TYPES, type RuleView } from "./contracts";

const historySchema = z
  .array(
    z.object({
      date: dateSchema,
      value: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .max(64),
      recorded: z.boolean(),
    }),
  )
  .min(14)
  .max(366);
export async function readRules(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<RuleView[]> {
  const rows = await tx.alertRule.findMany({ where: { businessId } });
  return rows
    .map((r) => ({
      id: r.id,
      type: r.type,
      enabled: r.enabled,
      threshold: r.threshold.toFixed(),
      version: r.version,
    }))
    .sort((a, b) => ALERT_TYPES.indexOf(a.type) - ALERT_TYPES.indexOf(b.type));
}
async function readForecastBasis(
  tx: Prisma.TransactionClient,
  businessId: string,
  yesterday: string,
): Promise<ForecastBasis | null> {
  const run = await tx.forecastRun.findFirst({
    where: {
      businessId,
      metricType: "REVENUE",
      trainingEnd: parseDate(yesterday),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      horizon: true,
      history: true,
      total: true,
      forecastStart: true,
      forecastEnd: true,
      gapsConfirmed: true,
      gapDays: true,
    },
  });
  if (!run || (run.gapDays > 0 && !run.gapsConfirmed)) return null;
  const history = historySchema.safeParse(run.history);
  if (
    !history.success ||
    history.data.at(-1)!.date !== yesterday ||
    history.data.some(
      (d, i) => i > 0 && d.date !== addDays(history.data[i - 1]!.date, 1),
    )
  )
    return null;
  const recent = history.data.slice(-30);
  const days =
    Math.round(
      (run.forecastEnd.getTime() - run.forecastStart.getTime()) / 86_400_000,
    ) + 1;
  if (days < 1 || days > 124) return null;
  return {
    id: run.id,
    horizon: run.horizon,
    from: dateOnly(run.forecastStart),
    to: dateOnly(run.forecastEnd),
    total: run.total.toFixed(),
    days,
    baselineDays: recent.length,
    baselineSum: recent
      .reduce((sum, day) => sum.plus(day.value), new Decimal(0))
      .toFixed(),
    baselineFrom: recent[0]!.date,
    baselineTo: recent.at(-1)!.date,
    gapsConfirmed: run.gapsConfirmed,
  };
}

// Runs inside a writer's transaction, before commit, or the alert workspace's transaction.
export async function evaluateAlertsInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  businessId: string,
  now = new Date(),
) {
  const business = await lockOwnedBusiness(tx, actorId, businessId);
  const rules = await readRules(tx, businessId),
    period = alertPeriod(business.timezone, now);
  if (!rules.some((r) => r.enabled))
    return {
      rules,
      period,
      createdCount: 0,
      evaluations: rules.map((r) => ({
        type: r.type,
        state: "DISABLED" as const,
        explanation: "Rule disabled. Existing alerts remain in history.",
        measuredPercent: null,
      })),
    };
  const data = await readDashboardSnapshot(
    tx,
    actorId,
    businessId,
    { period: "custom", from: period.from, to: period.to },
    now,
  );
  const forecast = rules.some((r) => r.type === "FORECAST_DROP" && r.enabled)
    ? await readForecastBasis(tx, businessId, period.to)
    : null;
  const result = evaluateRules(rules, {
    currency: business.currency,
    timezone: business.timezone,
    period,
    previousPeriod: data.period.previous,
    current: data.current,
    previous: data.previous,
    sentiment: data.sentiment,
    forecast,
    now,
  });
  const inserted = result.candidates.length
    ? await tx.alert.createMany({
        data: result.candidates.map((candidate) => ({
          ...candidate,
          businessId,
          periodFrom: parseDate(candidate.periodFrom),
          periodTo: parseDate(candidate.periodTo),
          evidence: candidate.evidence as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      })
    : { count: 0 };
  return {
    rules,
    period,
    evaluations: result.evaluations,
    createdCount: inserted.count,
  };
}
