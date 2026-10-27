import { createHash } from "node:crypto";
import { Decimal } from "@/lib/records/money";
import { addDays } from "@/lib/dashboard/period";
import { dateSchema } from "@/lib/validation/records";
import { ALGORITHM_VERSION, MAX_FORECAST_AMOUNT } from "./holt";
import { forecastPlan, daysBetween } from "./calendar";
import {
  FORECAST_OPTIONS,
  ForecastError,
  type ForecastMetric,
  type ForecastHorizon,
  type HistoryDay,
  type ForecastEligibility,
} from "./contracts";

export function prepareHistory(
  business: { id: string; currency: string; timezone: string },
  metricType: ForecastMetric,
  horizon: ForecastHorizon,
  daily: { date: string; value: string }[],
  now = new Date(),
) {
  const plan = forecastPlan(business.timezone, horizon, now);
  const values = new Map<string, string>();
  for (const day of daily) {
    dateSchema.parse(day.date);
    if (day.date < plan.historyFloor || day.date > plan.trainingEnd) continue;
    if (values.has(day.date))
      throw new ForecastError(422, "Daily history must have unique dates.");
    const value = new Decimal(day.value);
    if (
      !value.isFinite() ||
      value.isNegative() ||
      value.gte(MAX_FORECAST_AMOUNT)
    )
      throw new ForecastError(
        422,
        "A daily amount exceeds the supported forecasting range.",
      );
    values.set(day.date, value.toFixed());
  }
  const dates = [...values.keys()].sort();
  const trainingStart = dates[0] ?? null;
  const history: HistoryDay[] = trainingStart
    ? Array.from(
        { length: daysBetween(trainingStart, plan.trainingEnd) + 1 },
        (_, index) => {
          const date = addDays(trainingStart, index);
          return {
            date,
            value: values.get(date) ?? "0",
            recorded: values.has(date),
          };
        },
      )
    : [];
  const recordedDays = values.size,
    gapDates = history.filter((day) => !day.recorded).map((day) => day.date);
  const minimumDays = FORECAST_OPTIONS[horizon].minimumDays;
  const eligible = recordedDays >= minimumDays;
  const historyHash = createHash("sha256")
    .update(
      JSON.stringify({
        businessId: business.id,
        currency: business.currency,
        timezone: business.timezone,
        metricType,
        horizon,
        algorithm: ALGORITHM_VERSION,
        plan,
        history,
      }),
    )
    .digest("hex");
  const eligibility: ForecastEligibility = {
    businessId: business.id,
    currency: business.currency,
    timezone: business.timezone,
    metricType,
    horizon,
    plan,
    historyHash,
    trainingStart,
    totalDays: history.length,
    recordedDays,
    gapDays: gapDates.length,
    minimumDays,
    eligible,
    gapDates,
    message: !eligible
      ? `Not enough recorded history: ${recordedDays} of ${minimumDays} required dates for ${FORECAST_OPTIONS[horizon].label.toLowerCase()}. Add or import more historical records. Confirmed gaps do not increase this count.`
      : gapDates.length
        ? `Review ${gapDates.length} dates without records. Generate only if you confirm they had zero activity for this metric.`
        : "Enough recorded history is available. Review the forecast period before generating.",
  };
  return { eligibility, history };
}
