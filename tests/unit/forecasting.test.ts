// @vitest-environment node
import { expect, test } from "vitest";
import { Decimal } from "@/lib/records/money";
import {
  forecastPlan,
  displayForecastPoints,
} from "@/lib/forecasting/calendar";
import { prepareHistory } from "@/lib/forecasting/history";
import { addDays } from "@/lib/dashboard/period";
import {
  FORECAST_HORIZONS,
  FORECAST_OPTIONS,
  generateForecastSchema,
} from "@/lib/forecasting/contracts";
import {
  fitHolt,
  estimateHolt,
  projectHolt,
  evaluateHolt,
  forecastErrors,
  forecastMoney,
} from "@/lib/forecasting/holt";

test("Holt updates level and trend using the specified smoothing recurrences", () => {
  const state = fitHolt(["10", "12", "15", "15"], {
    alpha: "0.5",
    beta: "0.5",
  });
  expect(state.level.toFixed()).toBe("15.875");
  expect(state.trend.toFixed()).toBe("1.8125");
  expect(projectHolt(state, 2)).toEqual([
    { value: "17.6875", clamped: false },
    { value: "19.5", clamped: false },
  ]);
});
test("flat, linear and all-zero histories give reproducible parameters and forecasts", () => {
  for (const value of ["0", "125.75"]) {
    const values = Array(14).fill(value);
    const parameters = estimateHolt(values);
    expect(parameters).toEqual({ alpha: "0", beta: "0" });
    expect(
      projectHolt(fitHolt(values, parameters), 7).every(
        (point) => point.value === value,
      ),
    ).toBe(true);
  }
  const values = Array.from({ length: 14 }, (_, i) => String(10 + i * 2));
  const result = evaluateHolt(values, 7);
  expect(result.errors.mae).toBe("0");
  expect(result.errors.mape).toBe("0");
  expect(result.baselineErrors.mae).toBe("8");
  expect(
    projectHolt(fitHolt(values, result.parameters), 2).map(
      (point) => point.value,
    ),
  ).toEqual(["38", "40"]);
});
test("holdout observations never influence parameter selection or their predictions", () => {
  const train = ["10", "16", "12", "14", "30", "29", "16"];
  const a = evaluateHolt([...train, ...Array(7).fill("0")], 7);
  const b = evaluateHolt([...train, ...Array(7).fill("999")], 7);
  expect(a.parameters).toEqual(b.parameters);
  expect(a.predicted).toEqual(b.predicted);
  expect(a.errors.mae).not.toEqual(b.errors.mae);
});
test("negative predictions are clamped before error scoring, never presented as negative spending", () => {
  expect(
    projectHolt({ level: new Decimal(1), trend: new Decimal(-2) }, 3),
  ).toEqual(Array(3).fill({ value: "0", clamped: true }));
  const result = evaluateHolt(
    ["12", "10", "8", "6", "4", "2", "0", "0", "0", "0"],
    3,
  );
  expect(result.errors.mae).toBe("0");
  expect(result.errors.mape).toBeNull();
  expect(result.clamped).toBe(3);
});
test("MAE includes zero actuals and MAPE reports only nonzero observations", () => {
  expect(forecastErrors(["0", "10", "20"], ["3", "8", "24"])).toEqual({
    mae: "3",
    mape: "20",
    mapeSamples: 2,
    zeroActuals: 1,
  });
  expect(forecastErrors(["0", "0"], ["1", "2"])).toEqual({
    mae: "1.5",
    mape: null,
    mapeSamples: 0,
    zeroActuals: 2,
  });
  expect(() => forecastErrors([], [])).toThrow();
  expect(() => forecastErrors(["1"], ["1", "2"])).toThrow();
});
test("forecast formatting preserves large decimal values and currency rounding", () => {
  expect(forecastMoney("999999999999999.125", "SAR")).toBe(
    "999999999999999.13",
  );
  expect(forecastMoney("2.5", "JPY")).toBe("3");
  expect(forecastMoney("0.0005", "KWD")).toBe("0.001");
});
test("algorithm rejects missing/invalid observations, invalid parameters and unbounded horizons", () => {
  for (const values of [
    ["1", "2"],
    ["1", "NaN", "2"],
    ["1", "-1", "2"],
    ["1", "1e24", "2"],
  ])
    expect(() => estimateHolt(values)).toThrow();
  expect(() => fitHolt(["1", "2", "3"], { alpha: "2", beta: "0" })).toThrow();
  expect(() =>
    projectHolt({ level: new Decimal(1), trend: new Decimal(1) }, 1000),
  ).toThrow();
  expect(() => evaluateHolt(["1", "2", "3"], 2)).toThrow();
});

test("forecast calendar excludes today and starts daily estimates tomorrow in the business timezone", () => {
  const now = new Date("2026-09-30T22:30:00Z");
  expect(forecastPlan("Asia/Riyadh", "DAYS_7", now)).toMatchObject({
    trainingEnd: "2026-09-30",
    forecastStart: "2026-10-02",
    forecastEnd: "2026-10-08",
    forecastDays: 7,
    projectionDays: 8,
    bridgeDays: 1,
  });
  expect(forecastPlan("America/New_York", "DAYS_30", now)).toMatchObject({
    trainingEnd: "2026-09-29",
    forecastStart: "2026-10-01",
    forecastEnd: "2026-10-30",
    forecastDays: 30,
    projectionDays: 31,
  });
  expect(
    forecastPlan(
      "America/New_York",
      "DAYS_7",
      new Date("2026-03-08T12:00:00Z"),
    ),
  ).toMatchObject({ forecastStart: "2026-03-09", forecastEnd: "2026-03-15" });
});
test("three full calendar months respect leap years, month lengths and year boundaries", () => {
  expect(
    forecastPlan("UTC", "MONTHS_3", new Date("2023-11-15T12:00:00Z")),
  ).toMatchObject({
    forecastStart: "2023-12-01",
    forecastEnd: "2024-02-29",
    forecastDays: 91,
    granularity: "MONTH",
  });
  expect(
    forecastPlan("UTC", "MONTHS_3", new Date("2024-11-15T12:00:00Z")),
  ).toMatchObject({
    forecastStart: "2024-12-01",
    forecastEnd: "2025-02-28",
    forecastDays: 90,
  });
  const days = Array.from({ length: 91 }, (_, i) => ({
    date: addDays("2023-12-01", i),
    value: "0.1",
    clamped: false,
  }));
  expect(displayForecastPoints(days, "MONTH")).toEqual([
    { date: "2023-12-01", endDate: "2023-12-31", value: "3.1" },
    { date: "2024-01-01", endDate: "2024-01-31", value: "3.1" },
    { date: "2024-02-01", endDate: "2024-02-29", value: "2.9" },
  ]);
});
test.each(FORECAST_HORIZONS)(
  "%s requires its actual recorded-date minimum without padding eligibility",
  (horizon) => {
    const minimum = FORECAST_OPTIONS[horizon].minimumDays;
    const now = new Date("2026-10-01T12:00:00Z");
    const business = { id: "example", currency: "SAR", timezone: "UTC" };
    const daily = Array.from({ length: minimum }, (_, i) => ({
      date: addDays("2026-09-30", -i * 2),
      value: "0",
    }));
    const result = prepareHistory(business, "REVENUE", horizon, daily, now);
    expect(result.eligibility).toMatchObject({
      recordedDays: minimum,
      gapDays: minimum - 1,
      totalDays: minimum * 2 - 1,
      eligible: true,
    });
    expect(result.history[0]!.date).toBe(daily.at(-1)!.date);
    expect(
      prepareHistory(business, "REVENUE", horizon, daily.slice(1), now)
        .eligibility.eligible,
    ).toBe(false);
  },
);
test("history is bounded and excludes incomplete/future dates; snapshots distinguish gaps and explicit zeros", () => {
  const now = new Date("2026-10-01T12:00:00Z"),
    business = { id: "example", currency: "SAR", timezone: "UTC" };
  const result = prepareHistory(
    business,
    "REVENUE",
    "DAYS_7",
    [
      { date: "2020-01-01", value: "5" },
      { date: "2026-10-01", value: "999" },
      { date: "2026-10-02", value: "999" },
      { date: "2026-09-28", value: "0" },
      { date: "2026-09-30", value: "10.00" },
    ],
    now,
  );
  expect(result.history).toEqual([
    { date: "2026-09-28", value: "0", recorded: true },
    { date: "2026-09-29", value: "0", recorded: false },
    { date: "2026-09-30", value: "10", recorded: true },
  ]);
  expect(result.eligibility).toMatchObject({
    eligible: false,
    recordedDays: 2,
    gapDates: ["2026-09-29"],
  });
  expect(
    prepareHistory(business, "EXPENSE", "DAYS_7", [], now).eligibility,
  ).toMatchObject({
    eligible: false,
    trainingStart: null,
    totalDays: 0,
    gapDays: 0,
  });
});
test("history fingerprint is stable across ordering but changes with amounts, dates and options", () => {
  const business = { id: "example", currency: "SAR", timezone: "UTC" },
    now = new Date("2026-10-01T12:00:00Z");
  const daily = [
    { date: "2026-09-29", value: "1" },
    { date: "2026-09-30", value: "2" },
  ];
  const hash = prepareHistory(business, "REVENUE", "DAYS_7", daily, now)
    .eligibility.historyHash;
  expect(
    prepareHistory(business, "REVENUE", "DAYS_7", [...daily].reverse(), now)
      .eligibility.historyHash,
  ).toBe(hash);
  expect(
    prepareHistory(business, "REVENUE", "DAYS_30", daily, now).eligibility
      .historyHash,
  ).not.toBe(hash);
  expect(
    prepareHistory(
      business,
      "REVENUE",
      "DAYS_7",
      daily,
      new Date("2026-10-02T12:00:00Z"),
    ).eligibility.historyHash,
  ).not.toBe(hash);
  expect(
    prepareHistory(
      business,
      "REVENUE",
      "DAYS_7",
      [{ ...daily[0]!, value: "9" }, daily[1]!],
      now,
    ).eligibility.historyHash,
  ).not.toBe(hash);
  expect(() =>
    prepareHistory(business, "REVENUE", "DAYS_7", [daily[0]!, daily[0]!], now),
  ).toThrow("unique dates");
  expect(
    generateForecastSchema.safeParse({
      metricType: "REVENUE",
      horizon: "DAYS_7",
      historyHash: hash,
      confirmGaps: true,
      ownerId: "forged",
    }).success,
  ).toBe(false);
});
