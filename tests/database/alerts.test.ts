import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { testDatabase as db } from "../helpers/database";
import { alertFixture } from "../helpers/alert-database";
import { forecastFixture } from "../helpers/forecasting";
import { csv } from "../helpers/imports";
import { ALERT_TYPES } from "@/lib/alerts/contracts";
import {
  evaluateAlerts,
  getAlerts,
  getAlertSummary,
  getRecentAlerts,
  listAlertRules,
  markAllAlertsRead,
  updateAlertRule,
  updateAlertStatus,
} from "@/lib/alerts/service";
import { createBusiness, deleteBusiness } from "@/lib/business/service";
import { saveRecord, deleteRecord } from "@/lib/records/service";
import { parseDate, businessToday } from "@/lib/records/dates";
import { addDays } from "@/lib/dashboard/period";
import {
  generateForecast,
  getForecastEligibility,
} from "@/lib/forecasting/service";
import { analyzeFeedback } from "@/lib/feedback/service";
import { DEFAULT_MODEL, PROMPT_VERSION } from "@/lib/feedback/contracts";
import { previewImport, confirmImport } from "@/lib/imports/service";
import { buildAssistantContext } from "@/lib/assistant/context";

let owner: string, outsider: string;
const now = new Date();
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@alerts-test.example` },
    })
  ).id;
  outsider = (
    await db.user.create({
      data: { email: `${randomUUID()}@alerts-test.example`, role: "ADMIN" },
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
const fixture = () => alertFixture(db, owner, now);
test("new businesses have five defaults and read-only rule/summary access does not create alerts", async () => {
  const { business } = await fixture();
  expect(
    (await listAlertRules(db, owner, business.id)).map((r) => r.type),
  ).toEqual([...ALERT_TYPES]);
  expect(await getAlertSummary(db, owner, business.id)).toEqual({
    unread: 0,
    read: 0,
    dismissed: 0,
  });
  const result = await getAlerts(db, owner, business.id, {}, now);
  expect(result.createdCount).toBe(4);
  expect(result.items.map((r) => r.type).sort()).toEqual(
    [
      "SALES_DROP",
      "EXPENSE_INCREASE",
      "LOW_PROFIT_MARGIN",
      "NEGATIVE_FEEDBACK",
    ].sort(),
  );
  expect(
    result.items.find((r) => r.type === "LOW_PROFIT_MARGIN")!.evidence,
  ).toMatchObject({ currentValue: "2", baselineValue: "70", threshold: "10" });
});
test("parallel evaluations, refreshes and rule revisions create one immutable alert per type/period", async () => {
  const { business } = await fixture();
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      evaluateAlerts(db, owner, business.id, {}, now),
    ),
  );
  expect(results.reduce((n, r) => n + r.createdCount, 0)).toBe(4);
  const before = await getAlerts(db, owner, business.id, {}, now);
  const rule = before.rules.find((r) => r.type === "SALES_DROP")!;
  await updateAlertRule(
    db,
    owner,
    business.id,
    rule.id,
    { version: rule.version, enabled: true, threshold: "25" },
    now,
  );
  await db.salesRecord.updateMany({
    where: { businessId: business.id, saleDate: parseDate(before.period.to) },
    data: { unitPrice: "50", totalAmount: "50" },
  });
  const after = await getAlerts(db, owner, business.id, {}, now);
  expect(after.items.map((a) => a.id)).toEqual(before.items.map((a) => a.id));
  expect(after.items.map((a) => a.evidence)).toEqual(
    before.items.map((a) => a.evidence),
  );
});
test("read, mark-all and dismiss preserve timestamps and never reopen dismissed alerts on reevaluation", async () => {
  const { business } = await fixture(),
    data = await getAlerts(db, owner, business.id, {}, now),
    first = data.items[0]!;
  const read = await updateAlertStatus(
    db,
    owner,
    business.id,
    first.id,
    { version: first.version, status: "READ" },
    now,
  );
  expect(read.readAt).toBe(now.toISOString());
  const duplicate = await updateAlertStatus(
    db,
    owner,
    business.id,
    first.id,
    { version: first.version, status: "READ" },
    new Date(now.getTime() + 1000),
  );
  expect(duplicate).toEqual(read);
  await expect(
    updateAlertStatus(
      db,
      owner,
      business.id,
      first.id,
      { version: first.version, status: "DISMISSED" },
      now,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const dismissed = await updateAlertStatus(
    db,
    owner,
    business.id,
    first.id,
    { version: read.version, status: "DISMISSED" },
    now,
  );
  expect(dismissed).toMatchObject({
    readAt: now.toISOString(),
    dismissedAt: now.toISOString(),
  });
  expect(await markAllAlertsRead(db, owner, business.id, {}, now)).toEqual({
    changed: 3,
  });
  await evaluateAlerts(db, owner, business.id, {}, now);
  expect(await getAlertSummary(db, owner, business.id)).toEqual({
    unread: 0,
    read: 3,
    dismissed: 1,
  });
  expect(
    (await getRecentAlerts(db, owner, business.id, now)).items,
  ).toHaveLength(3);
  await expect(
    updateAlertStatus(
      db,
      owner,
      business.id,
      first.id,
      { version: dismissed.version, status: "READ" },
      now,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("disabled rules retain history; updates enforce bounds, optimistic versions and immediate re-evaluation", async () => {
  const { business } = await fixture(),
    rules = await listAlertRules(db, owner, business.id);
  const sales = rules.find((r) => r.type === "SALES_DROP")!;
  await updateAlertRule(
    db,
    owner,
    business.id,
    sales.id,
    { version: 1, enabled: false, threshold: "20" },
    now,
  );
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "SALES_DROP" },
    }),
  ).toBe(0);
  await expect(
    updateAlertRule(
      db,
      owner,
      business.id,
      sales.id,
      { version: 1, enabled: true, threshold: "20" },
      now,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    updateAlertRule(
      db,
      owner,
      business.id,
      sales.id,
      { version: 2, enabled: true, threshold: "101" },
      now,
    ),
  ).rejects.toMatchObject({ status: 422 });
  await updateAlertRule(
    db,
    owner,
    business.id,
    sales.id,
    { version: 2, enabled: true, threshold: "20" },
    now,
  );
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "SALES_DROP" },
    }),
  ).toBe(1);
  await updateAlertRule(
    db,
    owner,
    business.id,
    sales.id,
    { version: 3, enabled: false, threshold: "20" },
    now,
  );
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "SALES_DROP" },
    }),
  ).toBe(1);
});
test("missing costs block margin alerts; today/future records do not distort completed-period checks", async () => {
  const { business, period } = await fixture();
  await db.salesRecord.updateMany({
    where: { businessId: business.id, saleDate: parseDate(period.to) },
    data: { unitCost: null },
  });
  for (const date of [
    businessToday(business.timezone, now),
    addDays(period.to, 10),
  ])
    await db.salesRecord.create({
      data: {
        businessId: business.id,
        saleDate: parseDate(date),
        quantity: "1",
        unitPrice: "999999",
        unitCost: "0",
        totalAmount: "999999",
      },
    });
  const data = await getAlerts(db, owner, business.id, {}, now);
  expect(data.items.some((r) => r.type === "LOW_PROFIT_MARGIN")).toBe(false);
  expect(
    data.items.find((r) => r.type === "SALES_DROP")!.evidence.currentValue,
  ).toBe("70");
});
test("all reads and mutations enforce ownership, including admins, scoped child IDs and suspension", async () => {
  const { business } = await fixture(),
    data = await getAlerts(db, owner, business.id, {}, now),
    alert = data.items[0]!,
    rule = data.rules[0]!;
  await Promise.all(
    [
      getAlerts(db, outsider, business.id),
      listAlertRules(db, outsider, business.id),
      getAlertSummary(db, outsider, business.id),
      evaluateAlerts(db, outsider, business.id),
      markAllAlertsRead(db, outsider, business.id, {}),
      updateAlertStatus(db, outsider, business.id, alert.id, {
        version: 1,
        status: "READ",
      }),
      updateAlertRule(db, outsider, business.id, rule.id, {
        version: 1,
        enabled: false,
        threshold: "20",
      }),
    ].map((request) => expect(request).rejects.toMatchObject({ status: 404 })),
  );
  const other = await createBusiness(db, owner, {
    name: "Other",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  await expect(
    updateAlertStatus(db, owner, other.id, alert.id, {
      version: 1,
      status: "READ",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    updateAlertRule(db, owner, other.id, rule.id, {
      version: 1,
      enabled: false,
      threshold: "20",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  try {
    await expect(evaluateAlerts(db, owner, business.id)).rejects.toMatchObject({
      status: 403,
    });
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
});
test("record create, edit and delete check alerts atomically and keep historical triggers", async () => {
  const { business, period } = await fixture();
  const extra = await saveRecord(db, owner, business.id, "sales", {
    saleDate: period.to,
    quantity: "1",
    unitPrice: "5",
    unitCost: "0",
    costMode: "EXPLICIT",
    productServiceId: null,
  });
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "SALES_DROP" },
    }),
  ).toBe(1);
  const original = await db.alert.findFirstOrThrow({
    where: { businessId: business.id, type: "SALES_DROP" },
  });
  const edited = await saveRecord(
    db,
    owner,
    business.id,
    "sales",
    {
      version: extra.version,
      saleDate: period.to,
      quantity: "1",
      unitPrice: "100",
      unitCost: "0",
      costMode: "EXPLICIT",
      productServiceId: null,
    },
    extra.id,
  );
  await deleteRecord(db, owner, business.id, "sales", extra.id, {
    version: edited.version,
    confirmed: true,
  });
  expect(
    (await db.alert.findUniqueOrThrow({ where: { id: original.id } })).evidence,
  ).toEqual(original.evidence);
});
test("an alert-write failure rolls back its originating financial record", async () => {
  const { business, period } = await fixture(),
    before = await db.salesRecord.count({ where: { businessId: business.id } });
  const failing = {
    $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      db.$transaction((tx) =>
        work(
          new Proxy(tx, {
            get(target, property) {
              if (property === "alert")
                return new Proxy(target.alert, {
                  get(delegate, method) {
                    if (method === "createMany")
                      return async () => {
                        throw new Error("Injected alert failure");
                      };
                    return Reflect.get(delegate, method);
                  },
                });
              return Reflect.get(target, property);
            },
          }),
        ),
      ),
  } as unknown as PrismaClient;
  await expect(
    saveRecord(failing, owner, business.id, "sales", {
      saleDate: period.to,
      quantity: "1",
      unitPrice: "1",
      unitCost: "0",
      costMode: "EXPLICIT",
      productServiceId: null,
    }),
  ).rejects.toThrow("Injected alert failure");
  expect(
    await db.salesRecord.count({ where: { businessId: business.id } }),
  ).toBe(before);
  expect(await db.alert.count({ where: { businessId: business.id } })).toBe(0);
});
test("confirmed imports evaluate once at commit and repeated imports cannot duplicate alerts", async () => {
  const { business, period } = await fixture(),
    secret = "test-only alert import secret";
  const file = await csv(
    `date,category,amount\n${period.to},Rent,1`,
    "EXPENSES",
  );
  const preview = await previewImport(
    db,
    owner,
    business.id,
    "EXPENSES",
    file,
    secret,
  );
  expect(await db.alert.count({ where: { businessId: business.id } })).toBe(0);
  await confirmImport(
    db,
    owner,
    business.id,
    "EXPENSES",
    file,
    preview.token,
    true,
    secret,
  );
  expect(await db.alert.count({ where: { businessId: business.id } })).toBe(4);
  await confirmImport(
    db,
    owner,
    business.id,
    "EXPENSES",
    file,
    preview.token,
    true,
    secret,
  );
  expect(await db.alert.count({ where: { businessId: business.id } })).toBe(4);
});
test("feedback analysis triggers only after enough completed analyses, without another AI request", async () => {
  const { business } = await fixture();
  await db.customerFeedback.updateMany({
    where: { businessId: business.id },
    data: {
      analysisStatus: "PENDING",
      sentiment: "UNKNOWN",
      topic: null,
      aiSummary: null,
      confidence: null,
    },
  });
  const analyzer = () => ({
    provider: "NVIDIA",
    model: DEFAULT_MODEL,
    promptVersion: PROMPT_VERSION,
    analyze: async () => ({
      sentiment: "NEGATIVE" as const,
      topic: "staff" as const,
      summary: "Synthetic concern",
      confidence: 0.8,
    }),
  });
  await analyzeFeedback(
    db,
    owner,
    business.id,
    { mode: "PENDING" },
    analyzer,
    () => now,
  );
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "NEGATIVE_FEEDBACK" },
    }),
  ).toBe(0);
  await analyzeFeedback(
    db,
    owner,
    business.id,
    { mode: "PENDING" },
    analyzer,
    () => new Date(now.getTime() + 61000),
  );
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "NEGATIVE_FEEDBACK" },
    }),
  ).toBe(1);
});
test("fresh forecasts trigger automatically with saved daily-average baselines; stale runs are not re-evaluated", async () => {
  const b = await forecastFixture(db, owner, { now });
  const rows = await db.salesRecord.findMany({
    where: { businessId: b.id },
    orderBy: { saleDate: "asc" },
  });
  for (let i = 0; i < rows.length; i++)
    await db.salesRecord.update({
      where: { id: rows[i]!.id },
      data: {
        unitPrice: String((14 - i) * 10),
        totalAmount: String((14 - i) * 10),
      },
    });
  const review = await getForecastEligibility(db, owner, b.id, {}, now);
  const run = await generateForecast(
    db,
    owner,
    b.id,
    {
      metricType: "REVENUE",
      horizon: "DAYS_7",
      historyHash: review.historyHash,
      confirmGaps: false,
    },
    now,
  );
  const alert = await db.alert.findFirstOrThrow({
    where: { businessId: b.id, type: "FORECAST_DROP" },
  });
  expect(alert.evidence).toMatchObject({
    forecastId: run.item.id,
    currentValue: "0.0000",
    baselineValue: "75.0000",
    measuredPercent: "100.00",
  });
  const later = await evaluateAlerts(
    db,
    owner,
    b.id,
    {},
    new Date(now.getTime() + 86400000),
  );
  expect(later.evaluations.find((r) => r.type === "FORECAST_DROP")!.state).toBe(
    "INSUFFICIENT_DATA",
  );
  expect(
    await db.alert.count({
      where: { businessId: b.id, type: "FORECAST_DROP" },
    }),
  ).toBe(1);
});
test("pagination, status/type filters, composite constraints, assistant scope and business cascades", async () => {
  const { business, period } = await fixture(),
    foreign = await alertFixture(db, outsider, now);
  for (let i = 0; i < 6; i++)
    await evaluateAlerts(
      db,
      owner,
      business.id,
      {},
      new Date(now.getTime() + i * 86400000),
    );
  const first = await getAlerts(db, owner, business.id, {}, now),
    second = await getAlerts(db, owner, business.id, { page: 2 }, now);
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(4);
  expect(new Set([...first.items, ...second.items].map((a) => a.id)).size).toBe(
    24,
  );
  expect(
    (
      await getAlerts(db, owner, business.id, { type: "SALES_DROP" }, now)
    ).items.every((a) => a.type === "SALES_DROP"),
  ).toBe(true);
  const otherRule = (
    await listAlertRules(db, outsider, foreign.business.id)
  )[0]!;
  await expect(
    db.alert.update({
      where: { id: first.items[0]!.id },
      data: { ruleId: otherRule.id },
    }),
  ).rejects.toBeDefined();
  await expect(
    db.alertRule.update({
      where: { id: first.rules[0]!.id },
      data: { threshold: "-1" },
    }),
  ).rejects.toBeDefined();
  await expect(
    db.alert.update({
      where: { id: first.items[0]!.id },
      data: { status: "READ", readAt: null },
    }),
  ).rejects.toBeDefined();
  await evaluateAlerts(db, outsider, foreign.business.id, {}, now);
  await db.alert.updateMany({
    where: { businessId: foreign.business.id },
    data: { message: "PRIVATE OTHER OWNER ALERT" },
  });
  const context = await db.$transaction((tx) =>
    buildAssistantContext(
      tx,
      owner,
      business.id,
      { from: period.from, to: period.to },
      now,
    ),
  );
  expect(context.recentAlerts).toHaveLength(5);
  expect(JSON.stringify(context.recentAlerts)).not.toContain(
    foreign.business.id,
  );
  expect(JSON.stringify(context.recentAlerts)).not.toContain(
    "PRIVATE OTHER OWNER ALERT",
  );
  const current = await db.business.findUniqueOrThrow({
    where: { id: business.id },
  });
  await deleteBusiness(db, owner, business.id, {
    version: current.version,
    confirmationName: current.name,
  });
  expect(await db.alert.count({ where: { businessId: business.id } })).toBe(0);
  expect(await db.alertRule.count({ where: { businessId: business.id } })).toBe(
    0,
  );
});
