import { describe, expect, test } from "vitest";
import {
  calculateMetrics,
  dailySeries,
  dataInRange,
  growth,
  type DailyData,
} from "@/lib/dashboard/calculations";
import { resolvePeriod } from "@/lib/dashboard/period";
import { formatMoney } from "@/lib/dashboard/format";

const now = new Date("2024-03-01T00:30:00Z");
const empty: DailyData = { sales: [], expenses: [], customers: [] };
describe("dashboard periods", () => {
  test("uses business today and equal inclusive periods across leap day", () => {
    const result = resolvePeriod({ period: "7d" }, "America/New_York", now);
    expect(result.current).toEqual({
      from: "2024-02-23",
      to: "2024-02-29",
      days: 7,
    });
    expect(result.previous).toEqual({
      from: "2024-02-16",
      to: "2024-02-22",
      days: 7,
    });
    expect(resolvePeriod({ period: "7d" }, "Asia/Riyadh", now).current.to).toBe(
      "2024-03-01",
    );
    expect(resolvePeriod({}, "UTC", now).current.days).toBe(30);
    expect(resolvePeriod({ period: "90d" }, "UTC", now).current.days).toBe(90);
  });
  test("counts calendar days through DST and custom single-day periods", () => {
    const result = resolvePeriod(
      { period: "custom", from: "2024-03-09", to: "2024-03-11" },
      "America/New_York",
      new Date("2024-03-12T12:00Z"),
    );
    expect(result.current.days).toBe(3);
    expect(result.previous).toEqual({
      from: "2024-03-06",
      to: "2024-03-08",
      days: 3,
    });
    expect(
      resolvePeriod(
        { period: "custom", from: "2024-02-29", to: "2024-02-29" },
        "UTC",
        now,
      ).previous.from,
    ).toBe("2024-02-28");
  });
  test.each([
    { period: "custom" },
    { period: "custom", from: "2024-02-30", to: "2024-03-01" },
    { period: "custom", from: "2024-02-29", to: "2024-02-28" },
    { period: "custom", from: "2020-01-01", to: "2024-02-28" },
    { period: "custom", from: "2024-03-01", to: "2024-03-02" },
    { period: "custom", from: "1000-01-01", to: "1000-01-01" },
    { period: "7d", from: "2024-02-01" },
    { businessId: "injected" },
    { period: ["7d", "30d"] },
  ])("rejects ambiguous, invalid, excessive or future dates: %j", (input) => {
    expect(() => resolvePeriod(input, "UTC", now)).toThrow();
  });
});
test("profit excludes inventory and Other and exposes incomplete cost coverage", () => {
  const result = calculateMetrics({
    sales: [
      {
        date: "2024-02-29",
        revenue: "150",
        cogs: "30",
        transactions: 3,
        costKnown: 2,
      },
    ],
    expenses: [
      { date: "2024-02-29", operating: "20", inventory: "60", other: "5" },
    ],
    customers: [{ date: "2024-02-29", visits: 30 }],
  });
  expect(result).toMatchObject({
    revenue: "150",
    cogs: "30",
    operating: "20",
    inventory: "60",
    other: "5",
    totalExpenses: "85",
    profit: "100",
    margin: "66.67",
    averageSale: "50",
    costCoverage: "66.67",
    costMissing: 1,
    visits: 30,
    customerDays: 1,
  });
});
test("empty and zero-revenue periods never manufacture ratios or cost coverage", () => {
  expect(calculateMetrics(empty)).toMatchObject({
    revenue: "0",
    profit: "0",
    averageSale: null,
    margin: null,
    costCoverage: null,
  });
  expect(
    calculateMetrics({
      ...empty,
      expenses: [
        { date: "2024-02-29", operating: "10", inventory: "0", other: "0" },
      ],
    }),
  ).toMatchObject({ profit: "-10", margin: null });
  expect(
    calculateMetrics({
      ...empty,
      sales: [
        {
          date: "2024-02-29",
          revenue: "0",
          cogs: "0",
          costKnown: 1,
          transactions: 1,
        },
      ],
    }),
  ).toMatchObject({ averageSale: "0", margin: null, costCoverage: "100.00" });
});
test("growth handles zero baselines, decreases and unchanged values", () => {
  expect(growth("150", "100")).toBe("50.00");
  expect(growth("0", "100")).toBe("-100.00");
  expect(growth("100", "100")).toBe("0.00");
  expect(growth("100", "0")).toBeNull();
  expect(growth("0", "0")).toBeNull();
});
test("exact decimal totals and currency formatting survive fractional costs and large amounts", () => {
  const result = calculateMetrics({
    ...empty,
    sales: [
      {
        date: "2024-02-28",
        revenue: "0.1",
        cogs: "0.0000001",
        transactions: 1,
        costKnown: 1,
      },
      {
        date: "2024-02-29",
        revenue: "0.2",
        cogs: "0.0000002",
        transactions: 1,
        costKnown: 1,
      },
    ],
  });
  expect(result.revenue).toBe("0.3");
  expect(result.profit).toBe("0.2999997");
  expect(formatMoney("9007199254740993.125", "SAR")).toBe(
    "SAR 9,007,199,254,740,993.13",
  );
  expect(formatMoney("-1.235", "JOD")).toBe("JOD -1.235");
  expect(formatMoney("10.5", "JPY")).toBe("JPY 11");
});
test("series fills recorded financial totals but preserves missing visits versus explicit zero", () => {
  const data: DailyData = {
    ...empty,
    customers: [
      { date: "2024-02-28", visits: 0 },
      { date: "2024-02-29", visits: 8 },
    ],
  };
  const range = { from: "2024-02-27", to: "2024-02-29", days: 3 };
  expect(dailySeries(data, range).map((row) => row.visits)).toEqual([
    null,
    0,
    8,
  ]);
  expect(dailySeries(data, range).map((row) => row.revenue)).toEqual([
    "0",
    "0",
    "0",
  ]);
  expect(
    dataInRange(data, { from: "2024-02-29", to: "2024-02-29", days: 1 })
      .customers,
  ).toHaveLength(1);
});
