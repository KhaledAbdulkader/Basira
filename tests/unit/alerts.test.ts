import { expect, test } from "vitest";
import {
  alertFingerprint,
  alertPeriod,
  evaluateRules,
} from "@/lib/alerts/engine";
import {
  alertListSchema,
  updateAlertSchema,
  updateRuleSchema,
  type AlertType,
} from "@/lib/alerts/contracts";
import { alertInput, testRules } from "../helpers/alerts";
import { calculateMetrics } from "@/lib/dashboard/calculations";
import { readAlertQuery } from "@/lib/alerts/http";
const evaluate = (type: AlertType, input = alertInput()) =>
  evaluateRules(
    testRules.filter((r) => r.type === type),
    input,
  );

test("completed calendar windows use business timezone across DST and exclude today", () => {
  expect(alertPeriod("Asia/Riyadh", new Date("2026-10-08T22:00:00Z"))).toEqual({
    from: "2026-09-09",
    to: "2026-10-08",
    days: 30,
  });
  expect(
    alertPeriod("America/New_York", new Date("2026-03-09T03:30:00Z")),
  ).toEqual({ from: "2026-02-06", to: "2026-03-07", days: 30 });
});
test("empty, zero-baseline and disabled rules do not fabricate alerts", () => {
  const result = evaluateRules(testRules, alertInput());
  expect(result.candidates).toEqual([]);
  expect(result.evaluations.every((r) => r.state === "INSUFFICIENT_DATA")).toBe(
    true,
  );
  expect(
    evaluateRules(
      testRules.map((r) => ({ ...r, enabled: false })),
      alertInput(),
    ).evaluations.every((r) => r.state === "DISABLED"),
  ).toBe(true);
});
test.each([
  ["80", true],
  ["80.004", false],
  ["80.000001", false],
  ["79.999999", true],
  ["100", false],
  ["0", true],
])(
  "sales decline compares unrounded %s to the inclusive 20%% threshold",
  (revenue, triggers) => {
    const input = alertInput();
    Object.assign(input.current, { revenue, transactions: 1 });
    Object.assign(input.previous, { revenue: "100", transactions: 1 });
    expect(evaluate("SALES_DROP", input).candidates.length > 0).toBe(triggers);
  },
);
test("no current sales is unknown rather than an automatic 100% decline", () => {
  const input = alertInput();
  input.previous.revenue = "100";
  expect(evaluate("SALES_DROP", input).evaluations[0]!.state).toBe(
    "INSUFFICIENT_DATA",
  );
});
test("expense increase includes inventory/Other while profit excludes both", () => {
  const input = alertInput();
  input.current = calculateMetrics({
    sales: [
      {
        date: input.period.from,
        revenue: "100",
        cogs: "85",
        transactions: 1,
        costKnown: 1,
      },
    ],
    expenses: [
      { date: input.period.from, operating: "5", inventory: "10", other: "15" },
    ],
    customers: [],
  });
  input.previous.totalExpenses = "25";
  expect(
    evaluate("EXPENSE_INCREASE", input).candidates[0]!.evidence.measuredPercent,
  ).toBe("20.00");
  expect(input.current.profit).toBe("10");
  expect(evaluate("LOW_PROFIT_MARGIN", input).candidates).toHaveLength(0);
  input.current.profit = "9.9999";
  expect(evaluate("LOW_PROFIT_MARGIN", input).candidates).toHaveLength(1);
  input.current.costMissing = 1;
  expect(evaluate("LOW_PROFIT_MARGIN", input).evaluations[0]!.state).toBe(
    "INSUFFICIENT_DATA",
  );
});
test("negative feedback needs five analyzed comments, excludes unknowns and uses strict greater-than", () => {
  const input = alertInput();
  input.sentiment = {
    positive: 2,
    neutral: 0,
    negative: 2,
    unknown: 100,
    pending: 100,
    failed: 0,
    total: 104,
  };
  expect(evaluate("NEGATIVE_FEEDBACK", input).candidates).toHaveLength(0);
  input.sentiment.positive = 3;
  input.sentiment.total = 105;
  expect(evaluate("NEGATIVE_FEEDBACK", input).candidates).toHaveLength(0);
  input.sentiment.positive = 2;
  input.sentiment.negative = 3;
  const evidence = evaluate("NEGATIVE_FEEDBACK", input).candidates[0]!.evidence;
  expect(evidence.measuredPercent).toBe("60.00");
  expect(evidence.details[0]).toContain("5/105");
});
test("forecast drop normalizes unequal windows, preserves baseline dates and requires a positive baseline", () => {
  const input = alertInput();
  input.forecast = {
    id: "forecast",
    horizon: "DAYS_7",
    from: "2026-10-10",
    to: "2026-10-16",
    total: "560",
    days: 7,
    baselineSum: "3000",
    baselineDays: 30,
    baselineFrom: "2026-09-09",
    baselineTo: "2026-10-08",
    gapsConfirmed: false,
  };
  const result = evaluate("FORECAST_DROP", input).candidates[0]!;
  expect(result.evidence).toMatchObject({
    measuredPercent: "20.00",
    currentValue: "80.0000",
    baselineValue: "100.0000",
    comparisonFrom: "2026-09-09",
    forecastId: "forecast",
  });
  expect(result.periodFrom).toBe("2026-10-10");
  input.forecast.total = "595";
  expect(evaluate("FORECAST_DROP", input).candidates).toHaveLength(0);
  input.forecast.baselineSum = "0";
  expect(evaluate("FORECAST_DROP", input).evaluations[0]!.state).toBe(
    "INSUFFICIENT_DATA",
  );
});
test("fingerprints identify type, dates and forecast horizon but not mutable rule values or read state", () => {
  const a = alertFingerprint("SALES_DROP", "2026-09-09", "2026-10-08");
  expect(a).toMatch(/^[a-f0-9]{64}$/);
  expect(alertFingerprint("SALES_DROP", "2026-09-09", "2026-10-08")).toBe(a);
  expect(alertFingerprint("SALES_DROP", "2026-09-10", "2026-10-09")).not.toBe(
    a,
  );
  expect(
    alertFingerprint("EXPENSE_INCREASE", "2026-09-09", "2026-10-08"),
  ).not.toBe(a);
  expect(
    alertFingerprint("FORECAST_DROP", "2026-10-10", "2026-10-16", "DAYS_7"),
  ).not.toBe(
    alertFingerprint("FORECAST_DROP", "2026-10-10", "2026-10-16", "DAYS_30"),
  );
});
test("strict mutation/query schemas reject privilege fields, negative thresholds, exponent input and status resets", () => {
  expect(
    updateRuleSchema.safeParse({
      version: 1,
      enabled: true,
      threshold: "20",
      businessId: "foreign",
    }).success,
  ).toBe(false);
  for (const threshold of ["-1", "1e2", "2.001", "NaN"])
    expect(
      updateRuleSchema.safeParse({ version: 1, enabled: true, threshold })
        .success,
    ).toBe(false);
  expect(
    updateAlertSchema.safeParse({ version: 1, status: "UNREAD" }).success,
  ).toBe(false);
  expect(alertListSchema.safeParse({ page: 0 }).success).toBe(false);
  expect(() =>
    readAlertQuery(
      new Request("https://basira.example/alerts?status=READ&status=UNREAD"),
    ),
  ).toThrow();
});
