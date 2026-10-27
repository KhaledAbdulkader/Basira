import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, test } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { testDatabase as db } from "../helpers/database";
import { forecastFixture } from "../helpers/forecasting";
import {
  getForecastEligibility,
  generateForecast,
  getForecast,
  listForecasts,
} from "@/lib/forecasting/service";
import { getOwnedBusiness, deleteBusiness } from "@/lib/business/service";
import { parseDate } from "@/lib/records/dates";
import { addDays } from "@/lib/dashboard/period";
import type {
  ForecastHorizon,
  ForecastMetric,
} from "@/lib/forecasting/contracts";

let owner: string, outsider: string;
const now = new Date("2026-10-01T12:00:00Z");
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@forecast-test.example` },
    })
  ).id;
  outsider = (
    await db.user.create({
      data: { email: `${randomUUID()}@forecast-test.example`, role: "ADMIN" },
    })
  ).id;
});
afterAll(async () => {
  await db.business.deleteMany({
    where: { ownerId: { in: [owner, outsider].filter(Boolean) } },
  });
  await db.user.deleteMany({
    where: { id: { in: [owner, outsider].filter(Boolean) } },
  });
  await db.$disconnect();
});
async function request(
  id: string,
  horizon: ForecastHorizon = "DAYS_7",
  metricType: ForecastMetric = "REVENUE",
) {
  const review = await getForecastEligibility(
    db,
    owner,
    id,
    { horizon, metricType },
    now,
  );
  return {
    horizon,
    metricType,
    historyHash: review.historyHash,
    confirmGaps: review.gapDays > 0,
  };
}
test("empty/short history cannot persist a forecast, and preview never writes", async () => {
  const b = await forecastFixture(db, owner, { days: 13, now });
  const review = await getForecastEligibility(db, owner, b.id, {}, now);
  expect(review).toMatchObject({
    eligible: false,
    recordedDays: 13,
    minimumDays: 14,
  });
  await expect(
    generateForecast(db, owner, b.id, await request(b.id), now),
  ).rejects.toMatchObject({ status: 422 });
  expect(await db.forecastRun.count({ where: { businessId: b.id } })).toBe(0);
  expect(
    (
      await getForecastEligibility(
        db,
        owner,
        b.id,
        { metricType: "EXPENSE" },
        now,
      )
    ).recordedDays,
  ).toBe(0);
});
test.each(["DAYS_7", "DAYS_30", "MONTHS_3"] as const)(
  "%s creates the right stored points, decimal totals and held-out metrics",
  async (horizon) => {
    const days = horizon === "DAYS_7" ? 14 : horizon === "DAYS_30" ? 60 : 180;
    const b = await forecastFixture(db, owner, { days, now });
    const result = await generateForecast(
      db,
      owner,
      b.id,
      await request(b.id, horizon),
      now,
    );
    expect(result.alreadyGenerated).toBe(false);
    const detail = await getForecast(db, owner, b.id, result.item.id);
    expect(detail.points).toHaveLength(
      horizon === "DAYS_7" ? 7 : horizon === "DAYS_30" ? 30 : 3,
    );
    expect(detail).toMatchObject({
      mae: "0",
      mape: "0",
      baselineMae: "0",
      recordedDays: days,
      gapDays: 0,
      currency: "SAR",
      timezone: "Asia/Riyadh",
    });
    expect(detail.history).toHaveLength(days);
    expect(detail.points[0]!.date).toBe(
      horizon === "MONTHS_3" ? "2026-11-01" : "2026-10-02",
    );
    expect(detail.total).toBe(
      horizon === "DAYS_7" ? "70" : horizon === "DAYS_30" ? "300" : "920",
    );
    if (horizon === "MONTHS_3")
      expect(detail.points.map((point) => point.value)).toEqual([
        "300",
        "310",
        "310",
      ]);
    expect(
      await db.forecastPoint.findFirst({
        where: { forecastRunId: result.item.id },
      }),
    ).toMatchObject({ lowerBound: null, upperBound: null });
  },
);
test("gaps require explicit confirmation and scores retain the assumed-zero dates", async () => {
  const b = await forecastFixture(db, owner, { days: 14, spacing: 2, now });
  const review = await getForecastEligibility(db, owner, b.id, {}, now);
  expect(review).toMatchObject({
    recordedDays: 14,
    gapDays: 13,
    totalDays: 27,
    eligible: true,
  });
  const input = await request(b.id);
  await expect(
    generateForecast(db, owner, b.id, { ...input, confirmGaps: false }, now),
  ).rejects.toMatchObject({ status: 422 });
  const result = await generateForecast(db, owner, b.id, input, now);
  const run = await getForecast(db, owner, b.id, result.item.id);
  expect(run).toMatchObject({
    gapDays: 13,
    gapsConfirmed: true,
    mapeSamples: 4,
  });
  expect(run.history.filter((day) => !day.recorded)).toHaveLength(13);
  expect(run.backtest.filter((day) => !day.recorded)).toHaveLength(3);
});

test("a daily linear trend skips today's bridge step before the seven displayed dates", async () => {
  const b = await forecastFixture(db, owner, { days: 0, now });
  await db.salesRecord.createMany({
    data: Array.from({ length: 14 }, (_, i) => ({
      businessId: b.id,
      saleDate: parseDate(addDays("2026-09-17", i)),
      quantity: "1",
      unitPrice: String(10 + i),
      totalAmount: String(10 + i),
    })),
  });
  const result = await generateForecast(
    db,
    owner,
    b.id,
    await request(b.id),
    now,
  );
  const detail = await getForecast(db, owner, b.id, result.item.id);
  expect(detail.points.map((point) => point.value)).toEqual([
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
    "31",
  ]);
  expect(detail).toMatchObject({
    total: "196",
    mae: "0",
    baselineMae: "4",
    forecastStart: "2026-10-02",
    forecastEnd: "2026-10-08",
  });
});
test("all-expense projections include inventory and Other but never use sales or another business", async () => {
  const b = await forecastFixture(db, owner, {
    metric: "EXPENSE",
    days: 14,
    value: "25.10",
    now,
  });
  await forecastFixture(db, outsider, { metric: "EXPENSE", value: "999", now });
  const result = await generateForecast(
    db,
    owner,
    b.id,
    await request(b.id, "DAYS_7", "EXPENSE"),
    now,
  );
  const run = await getForecast(db, owner, b.id, result.item.id);
  expect(run.total).toBe("175.7");
  expect(run.history.every((day) => day.value === "25.1")).toBe(true);
  expect(
    (
      await getForecastEligibility(
        db,
        owner,
        b.id,
        { metricType: "REVENUE" },
        now,
      )
    ).recordedDays,
  ).toBe(0);
});
test("today/future values are excluded and multiple transactions do not inflate recorded-date coverage", async () => {
  const b = await forecastFixture(db, owner, { days: 14, now });
  await db.salesRecord.createMany({
    data: ["2026-10-01", "2026-10-02", "2026-09-30"].map((date) => ({
      businessId: b.id,
      saleDate: parseDate(date),
      quantity: "1",
      unitPrice: "20",
      totalAmount: "20",
    })),
  });
  const review = await getForecastEligibility(db, owner, b.id, {}, now);
  expect(review.recordedDays).toBe(14);
  const result = await generateForecast(
    db,
    owner,
    b.id,
    await request(b.id),
    now,
  );
  const run = await getForecast(db, owner, b.id, result.item.id);
  expect(run.history.at(-1)).toMatchObject({ date: "2026-09-30", value: "30" });
  expect(run.history.some((day) => day.date >= "2026-10-01")).toBe(false);
});
test("saved forecasts are immutable snapshots, while changed history and midnight invalidate an old review", async () => {
  const b = await forecastFixture(db, owner, { now });
  const input = await request(b.id);
  const result = await generateForecast(db, owner, b.id, input, now);
  await db.salesRecord.updateMany({
    where: { businessId: b.id, saleDate: parseDate("2026-09-30") },
    data: { totalAmount: "20", unitPrice: "20" },
  });
  await expect(
    generateForecast(db, owner, b.id, input, now),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await getForecast(db, owner, b.id, result.item.id)).history.at(-1)!.value,
  ).toBe("10");
  const fresh = await request(b.id);
  await expect(
    generateForecast(db, owner, b.id, fresh, new Date("2026-10-02T12:00:00Z")),
  ).rejects.toMatchObject({ status: 409 });
  const updated = await generateForecast(db, owner, b.id, fresh, now);
  expect(updated.item.id).not.toBe(result.item.id);
});
test("concurrent generation is idempotent and owns all run/point reads, including ADMIN and suspension", async () => {
  const b = await forecastFixture(db, owner, { now });
  const input = await request(b.id);
  const results = await Promise.all(
    [1, 2].map(() => generateForecast(db, owner, b.id, input, now)),
  );
  expect(results.map((result) => result.alreadyGenerated).sort()).toEqual([
    false,
    true,
  ]);
  expect(new Set(results.map((result) => result.item.id)).size).toBe(1);
  await expect(
    getForecastEligibility(db, outsider, b.id, {}, now),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    generateForecast(db, outsider, b.id, input, now),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    getForecast(db, outsider, b.id, results[0]!.item.id),
  ).rejects.toMatchObject({ status: 404 });
  await expect(listForecasts(db, outsider, b.id)).rejects.toMatchObject({
    status: 404,
  });
  const other = await forecastFixture(db, owner, { now });
  await expect(
    getForecast(db, owner, other.id, results[0]!.item.id),
  ).rejects.toMatchObject({ status: 404 });
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  try {
    await expect(
      generateForecast(db, owner, b.id, input, now),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      getForecast(db, owner, b.id, results[0]!.item.id),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
});
test("zero-revenue days produce honest zero forecasts and unavailable MAPE", async () => {
  const b = await forecastFixture(db, owner, { value: "0", now });
  const result = await generateForecast(
    db,
    owner,
    b.id,
    await request(b.id),
    now,
  );
  expect(await getForecast(db, owner, b.id, result.item.id)).toMatchObject({
    total: "0",
    mae: "0",
    mape: null,
    mapeSamples: 0,
  });
});
test("an unexpected persistence failure rolls back the run and its points", async () => {
  const b = await forecastFixture(db, owner, { now });
  const failing = db.$extends({
    query: {
      forecastRun: {
        async create({ args, query }) {
          await query(args);
          throw new Error("Injected failure after run and points");
        },
      },
    },
  }) as unknown as PrismaClient;
  await expect(
    generateForecast(failing, owner, b.id, await request(b.id), now),
  ).rejects.toThrow("Injected failure");
  expect(await db.forecastRun.count({ where: { businessId: b.id } })).toBe(0);
  expect(
    await db.forecastPoint.count({ where: { run: { businessId: b.id } } }),
  ).toBe(0);
});
test("deleting a business cascades through runs and points while the financial lock survives record deletion", async () => {
  const b = await forecastFixture(db, owner, { now });
  const result = await generateForecast(
    db,
    owner,
    b.id,
    await request(b.id),
    now,
  );
  await db.salesRecord.deleteMany({ where: { businessId: b.id } });
  const current = await getOwnedBusiness(db, owner, b.id);
  expect(current.financialSettingsLockedAt).not.toBeNull();
  expect(
    (await getForecast(db, owner, b.id, result.item.id)).points,
  ).toHaveLength(7);
  await deleteBusiness(db, owner, b.id, {
    version: current.version,
    confirmationName: current.name,
  });
  expect(
    await db.forecastRun.findUnique({ where: { id: result.item.id } }),
  ).toBeNull();
  expect(
    await db.forecastPoint.count({ where: { forecastRunId: result.item.id } }),
  ).toBe(0);
});
test("history pagination is bounded and database checks reject negative predictions", async () => {
  const b = await forecastFixture(db, owner, { now });
  const result = await generateForecast(
    db,
    owner,
    b.id,
    await request(b.id),
    now,
  );
  const existing = await db.forecastRun.findUniqueOrThrow({
    where: { id: result.item.id },
  });
  const { id: _id, ...snapshot } = existing;
  void _id;
  await db.forecastRun.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      ...snapshot,
      historyHash: i.toString(16).padStart(64, "0"),
      createdAt: new Date(now.getTime() + i * 1000),
      history: existing.history!,
      dailyForecast: existing.dailyForecast!,
      backtest: existing.backtest!,
    })),
  });
  expect((await listForecasts(db, owner, b.id)).items).toHaveLength(20);
  expect((await listForecasts(db, owner, b.id, 2)).items).toHaveLength(1);
  await expect(
    db.forecastPoint.create({
      data: {
        forecastRunId: result.item.id,
        forecastDate: parseDate(addDays("2026-10-08", 1)),
        periodEnd: parseDate("2026-10-09"),
        predictedValue: "-1",
      },
    }),
  ).rejects.toThrow();
});
