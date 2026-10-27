import { z } from "zod";

export const FORECAST_HORIZONS = ["DAYS_7", "DAYS_30", "MONTHS_3"] as const;
export const FORECAST_OPTIONS = {
  DAYS_7: { label: "Next 7 days", minimumDays: 14, testDays: 7 },
  DAYS_30: { label: "Next 30 days", minimumDays: 60, testDays: 30 },
  MONTHS_3: { label: "Next 3 months", minimumDays: 180, testDays: 90 },
} as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];
export type ForecastMetric = "REVENUE" | "EXPENSE";
export const forecastQuerySchema = z
  .object({
    metricType: z.enum(["REVENUE", "EXPENSE"]).default("REVENUE"),
    horizon: z.enum(FORECAST_HORIZONS).default("DAYS_7"),
  })
  .strict();
export const generateForecastSchema = z
  .object({
    metricType: z.enum(["REVENUE", "EXPENSE"]),
    horizon: z.enum(FORECAST_HORIZONS),
    historyHash: z.string().regex(/^[a-f0-9]{64}$/),
    confirmGaps: z.boolean(),
  })
  .strict();
export const forecastPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100000)
  .default(1);
export type HistoryDay = { date: string; value: string; recorded: boolean };
export type ForecastDay = { date: string; value: string; clamped: boolean };
export type BacktestDay = {
  date: string;
  actual: string;
  predicted: string;
  baseline: string;
  recorded: boolean;
};
export type ForecastPlan = {
  today: string;
  historyFloor: string;
  trainingEnd: string;
  forecastStart: string;
  forecastEnd: string;
  forecastDays: number;
  projectionDays: number;
  bridgeDays: number;
  granularity: "DAY" | "MONTH";
};
export type ForecastEligibility = {
  businessId: string;
  currency: string;
  timezone: string;
  metricType: ForecastMetric;
  horizon: ForecastHorizon;
  plan: ForecastPlan;
  historyHash: string;
  trainingStart: string | null;
  totalDays: number;
  recordedDays: number;
  gapDays: number;
  minimumDays: number;
  eligible: boolean;
  message: string;
  gapDates: string[];
};
export type ForecastListItem = {
  id: string;
  metricType: ForecastMetric;
  horizon: ForecastHorizon;
  currency: string;
  forecastStart: string;
  forecastEnd: string;
  total: string;
  createdAt: string;
};
export type ForecastDetail = ForecastListItem & {
  businessId: string;
  timezone: string;
  algorithm: string;
  granularity: "DAY" | "MONTH";
  trainingStart: string;
  trainingEnd: string;
  recordedDays: number;
  gapDays: number;
  gapsConfirmed: boolean;
  alpha: string;
  beta: string;
  trainingCount: number;
  backtestCount: number;
  mae: string;
  mape: string | null;
  mapeSamples: number;
  baselineMae: string;
  clampedCount: number;
  history: HistoryDay[];
  dailyForecast: ForecastDay[];
  backtest: BacktestDay[];
  points: { date: string; endDate: string; value: string }[];
};
export class ForecastError extends Error {
  constructor(
    public readonly status: 409 | 422,
    message: string,
  ) {
    super(message);
  }
}
