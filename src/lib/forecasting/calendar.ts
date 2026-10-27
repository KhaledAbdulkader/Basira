import { businessToday, dateOnly, parseDate } from "@/lib/records/dates";
import { addDays } from "@/lib/dashboard/period";
import { dateSchema } from "@/lib/validation/records";
import { Decimal } from "@/lib/records/money";
import type { ForecastHorizon, ForecastPlan, ForecastDay } from "./contracts";

export const daysBetween = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
export function monthStart(date: string, offset = 0) {
  const value = parseDate(date.slice(0, 7) + "-01");
  value.setUTCMonth(value.getUTCMonth() + offset);
  return dateOnly(value);
}
export function forecastPlan(
  timezone: string,
  horizon: ForecastHorizon,
  now = new Date(),
): ForecastPlan {
  const today = businessToday(timezone, now);
  const trainingEnd = addDays(today, -1);
  const historyFloor = addDays(trainingEnd, -365);
  const forecastStart =
    horizon === "MONTHS_3" ? monthStart(today, 1) : addDays(today, 1);
  const forecastEnd =
    horizon === "MONTHS_3"
      ? addDays(monthStart(today, 4), -1)
      : addDays(forecastStart, horizon === "DAYS_7" ? 6 : 29);
  for (const date of [trainingEnd, historyFloor, forecastStart, forecastEnd])
    dateSchema.parse(date);
  return {
    today,
    trainingEnd,
    historyFloor,
    forecastStart,
    forecastEnd,
    forecastDays: daysBetween(forecastStart, forecastEnd) + 1,
    projectionDays: daysBetween(trainingEnd, forecastEnd),
    bridgeDays: daysBetween(trainingEnd, forecastStart) - 1,
    granularity: horizon === "MONTHS_3" ? "MONTH" : "DAY",
  };
}
export function displayForecastPoints(
  daily: ForecastDay[],
  granularity: "DAY" | "MONTH",
) {
  if (granularity === "DAY")
    return daily.map((point) => ({
      date: point.date,
      endDate: point.date,
      value: point.value,
    }));
  const months = new Map<
    string,
    { date: string; endDate: string; value: string }
  >();
  for (const point of daily) {
    const date = monthStart(point.date);
    const item = months.get(date) ?? {
      date,
      endDate: addDays(monthStart(date, 1), -1),
      value: "0",
    };
    item.value = new Decimal(item.value).plus(point.value).toFixed();
    months.set(date, item);
  }
  return [...months.values()];
}
