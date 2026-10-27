import { evaluateAlertsInTransaction } from "@/lib/alerts/evaluation";
import {
  Prisma,
  type PrismaClient,
  type ForecastRun,
} from "@/generated/prisma/client";
import {
  BusinessError,
  getOwnedBusiness,
  lockOwnedBusiness,
  lockFinancialSettings,
} from "@/lib/business/service";
import { dateOnly, parseDate } from "@/lib/records/dates";
import { addDays } from "@/lib/dashboard/period";
import { Decimal } from "@/lib/records/money";
import { recordIdSchema } from "@/lib/validation/records";
import { prepareHistory } from "./history";
import { forecastPlan, displayForecastPoints } from "./calendar";
import {
  ALGORITHM_VERSION,
  evaluateHolt,
  fitHolt,
  projectHolt,
  forecastMoney,
} from "./holt";
import {
  forecastQuerySchema,
  generateForecastSchema,
  forecastPageSchema,
  FORECAST_OPTIONS,
  ForecastError,
  type ForecastMetric,
  type ForecastHorizon,
  type ForecastDetail,
  type ForecastListItem,
  type HistoryDay,
  type ForecastDay,
  type BacktestDay,
} from "./contracts";

type Database = PrismaClient | Prisma.TransactionClient;
const listingFields = {
  id: true,
  metricType: true,
  horizon: true,
  currency: true,
  forecastStart: true,
  forecastEnd: true,
  total: true,
  createdAt: true,
} as const;
function listItem(
  row: Pick<ForecastRun, keyof typeof listingFields>,
): ForecastListItem {
  return {
    id: row.id,
    metricType: row.metricType,
    horizon: row.horizon,
    currency: row.currency,
    forecastStart: dateOnly(row.forecastStart),
    forecastEnd: dateOnly(row.forecastEnd),
    total: row.total.toFixed(),
    createdAt: row.createdAt.toISOString(),
  };
}
async function readHistory(
  db: Database,
  business: { id: string; currency: string; timezone: string },
  metric: ForecastMetric,
  horizon: ForecastHorizon,
  now: Date,
) {
  const plan = forecastPlan(business.timezone, horizon, now);
  const daily =
    metric === "REVENUE"
      ? await db.$queryRaw<{ date: string; value: string }[]>`
    SELECT to_char("saleDate", 'YYYY-MM-DD') AS date, SUM("totalAmount")::text AS value
    FROM "SalesRecord" WHERE "businessId" = ${business.id}
    AND "saleDate" BETWEEN ${plan.historyFloor}::date AND ${plan.trainingEnd}::date
    GROUP BY "saleDate" ORDER BY "saleDate"`
      : await db.$queryRaw<{ date: string; value: string }[]>`
    SELECT to_char("expenseDate", 'YYYY-MM-DD') AS date, SUM(amount)::text AS value
    FROM "ExpenseRecord" WHERE "businessId" = ${business.id}
    AND "expenseDate" BETWEEN ${plan.historyFloor}::date AND ${plan.trainingEnd}::date
    GROUP BY "expenseDate" ORDER BY "expenseDate"`;
  return prepareHistory(business, metric, horizon, daily, now);
}
export async function getForecastEligibility(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
  now = new Date(),
) {
  const query = forecastQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const business = await getOwnedBusiness(tx, actorId, businessId);
      return (
        await readHistory(tx, business, query.metricType, query.horizon, now)
      ).eligibility;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export async function generateForecast(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
  now = new Date(),
) {
  const query = generateForecastSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const business = await lockOwnedBusiness(tx, actorId, businessId);
      const { eligibility, history } = await readHistory(
        tx,
        business,
        query.metricType,
        query.horizon,
        now,
      );
      if (query.historyHash !== eligibility.historyHash)
        throw new ForecastError(
          409,
          "The history or forecast dates changed. Refresh the history review and confirm again.",
        );
      if (!eligibility.eligible)
        throw new ForecastError(422, eligibility.message);
      if (eligibility.gapDays && !query.confirmGaps)
        throw new ForecastError(
          422,
          "Confirm that every listed gap represents zero activity for the selected metric, or add the missing records before forecasting.",
        );
      const where = {
        businessId_metricType_horizon_algorithm_historyHash: {
          businessId,
          metricType: query.metricType,
          horizon: query.horizon,
          algorithm: ALGORITHM_VERSION,
          historyHash: eligibility.historyHash,
        },
      };
      const existing = await tx.forecastRun.findUnique({
        where,
        select: listingFields,
      });
      if (existing) return { item: listItem(existing), alreadyGenerated: true };
      const { plan } = eligibility;
      let evaluation, dailyForecast, points;
      try {
        const values = history.map((day) => day.value);
        evaluation = evaluateHolt(
          values,
          FORECAST_OPTIONS[query.horizon].testDays,
        );
        const projection = projectHolt(
          fitHolt(values, evaluation.parameters),
          plan.projectionDays,
        );
        dailyForecast = projection
          .map((point, index) => ({
            date: addDays(plan.trainingEnd, index + 1),
            value: forecastMoney(point.value, business.currency),
            clamped: point.clamped,
          }))
          .filter((point) => point.date >= plan.forecastStart);
        points = displayForecastPoints(dailyForecast, plan.granularity);
      } catch {
        throw new ForecastError(
          422,
          "These amounts cannot be forecast within the supported numeric range. Review the historical records.",
        );
      }
      const backtest = history
        .slice(-evaluation.testCount)
        .map((day, index) => ({
          date: day.date,
          recorded: day.recorded,
          actual: day.value,
          predicted: evaluation.predicted[index]!,
          baseline: evaluation.baseline[index]!,
        }));
      const total = points.reduce(
        (sum, point) => sum.plus(point.value),
        new Decimal(0),
      );
      await lockFinancialSettings(tx, actorId, businessId);
      const result = await tx.forecastRun.create({
        data: {
          businessId,
          metricType: query.metricType,
          horizon: query.horizon,
          algorithm: ALGORITHM_VERSION,
          granularity: plan.granularity,
          currency: business.currency,
          timezone: business.timezone,
          historyHash: eligibility.historyHash,
          trainingStart: parseDate(eligibility.trainingStart!),
          trainingEnd: parseDate(plan.trainingEnd),
          forecastStart: parseDate(plan.forecastStart),
          forecastEnd: parseDate(plan.forecastEnd),
          recordedDays: eligibility.recordedDays,
          gapDays: eligibility.gapDays,
          gapsConfirmed: eligibility.gapDays > 0 && query.confirmGaps,
          alpha: evaluation.parameters.alpha,
          beta: evaluation.parameters.beta,
          trainingCount: evaluation.trainingCount,
          backtestCount: evaluation.testCount,
          mae: new Decimal(evaluation.errors.mae).toDecimalPlaces(8),
          mape:
            evaluation.errors.mape === null
              ? null
              : new Decimal(evaluation.errors.mape).toDecimalPlaces(8),
          mapeSamples: evaluation.errors.mapeSamples,
          baselineMae: new Decimal(
            evaluation.baselineErrors.mae,
          ).toDecimalPlaces(8),
          clampedCount: dailyForecast.filter((point) => point.clamped).length,
          total,
          history,
          dailyForecast,
          backtest,
          points: {
            create: points.map((point) => ({
              forecastDate: parseDate(point.date),
              periodEnd: parseDate(point.endDate),
              predictedValue: point.value,
            })),
          },
        },
        select: listingFields,
      });
      await evaluateAlertsInTransaction(tx, actorId, businessId, now);
      return { item: listItem(result), alreadyGenerated: false };
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function listForecasts(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown = 1,
) {
  const page = forecastPageSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await getOwnedBusiness(tx, actorId, businessId);
      const where = { businessId };
      const [items, total] = await Promise.all([
        tx.forecastRun.findMany({
          where,
          select: listingFields,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        tx.forecastRun.count({ where }),
      ]);
      return { items: items.map(listItem), total, page, pageSize: 20 };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export async function getForecast(
  db: Database,
  actorId: string,
  businessId: string,
  id: string,
): Promise<ForecastDetail> {
  await getOwnedBusiness(db, actorId, businessId);
  const row = await db.forecastRun.findFirst({
    where: { id: recordIdSchema.parse(id), businessId },
    include: { points: { orderBy: { forecastDate: "asc" } } },
  });
  if (!row) throw new BusinessError(404, "Forecast not found.");
  return {
    ...listItem(row),
    businessId: row.businessId,
    timezone: row.timezone,
    algorithm: row.algorithm,
    granularity: row.granularity,
    trainingStart: dateOnly(row.trainingStart),
    trainingEnd: dateOnly(row.trainingEnd),
    recordedDays: row.recordedDays,
    gapDays: row.gapDays,
    gapsConfirmed: row.gapsConfirmed,
    alpha: row.alpha.toFixed(),
    beta: row.beta.toFixed(),
    trainingCount: row.trainingCount,
    backtestCount: row.backtestCount,
    mae: row.mae.toFixed(),
    mape: row.mape?.toFixed() ?? null,
    mapeSamples: row.mapeSamples,
    baselineMae: row.baselineMae.toFixed(),
    clampedCount: row.clampedCount,
    history: row.history as HistoryDay[],
    dailyForecast: row.dailyForecast as ForecastDay[],
    backtest: row.backtest as BacktestDay[],
    points: row.points.map((point) => ({
      date: dateOnly(point.forecastDate),
      endDate: dateOnly(point.periodEnd),
      value: point.predictedValue.toFixed(),
    })),
  };
}
