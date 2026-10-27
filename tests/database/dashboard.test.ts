import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, test, expect } from "vitest";
import { testDatabase as db } from "../helpers/database";
import { dashboardFixture, fixturePeriod } from "../helpers/dashboard";
import { getDashboard } from "@/lib/dashboard/service";
import { createBusiness } from "@/lib/business/service";
import { saveRecord } from "@/lib/records/service";

let owner: string;
let outsider: string;
const now = new Date("2024-03-01T12:00Z");
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@dashboard-test.example` },
    })
  ).id;
  outsider = (
    await db.user.create({
      data: { email: `${randomUUID()}@dashboard-test.example`, role: "ADMIN" },
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
const makeBusiness = () =>
  createBusiness(db, owner, {
    name: "Dashboard tests",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });

test("aggregates scoped historical data, inclusive periods, null/zero costs and analysis status", async () => {
  const { business, product, rent } = await dashboardFixture(db, owner);
  await saveRecord(
    db,
    owner,
    business.id,
    "products",
    {
      name: "New name",
      type: "PRODUCT",
      sellingPrice: "999",
      costPrice: "999",
      active: false,
      version: product.version,
    },
    product.id,
  );
  await saveRecord(
    db,
    owner,
    business.id,
    "expense-categories",
    {
      name: "Renamed rent",
      classification: "INVENTORY_PURCHASE",
      version: rent.version,
    },
    rent.id,
  );
  const result = await getDashboard(db, owner, business.id, fixturePeriod, now);
  expect(result.current).toMatchObject({
    revenue: "150",
    cogs: "30",
    operating: "20",
    profit: "100",
    margin: "66.67",
    inventory: "60",
    other: "5",
    totalExpenses: "85",
    transactions: 3,
    averageSale: "50",
    costKnown: 2,
    costMissing: 1,
    costCoverage: "66.67",
    visits: 30,
    customerDays: 2,
  });
  expect(result.previous).toMatchObject({
    revenue: "100",
    cogs: "20",
    operating: "10",
    profit: "70",
    visits: 10,
  });
  expect(result.comparison).toEqual({
    revenueGrowth: "50.00",
    visitGrowth: "200.00",
  });
  expect(result.topRevenue.map((row) => row.name)).toEqual([
    "Latte",
    "Unlinked sales",
  ]);
  expect(result.bestSelling[0]).toMatchObject({
    name: "Latte",
    quantity: "11.000",
  });
  expect(result.categories).toContainEqual({
    name: "Renamed rent",
    classification: "OPERATING",
    amount: "20.0000",
  });
  expect(result.sentiment).toEqual({
    total: 4,
    positive: 1,
    neutral: 0,
    negative: 0,
    unknown: 3,
    pending: 2,
    failed: 1,
  });
  expect(result.series).toHaveLength(7);
  expect(result.series[0]).toMatchObject({
    date: "2024-02-22",
    revenue: "100.0000",
    profit: "50",
    visits: 30,
  });
  expect(result.series[1]?.visits).toBeNull();
  expect(result.series[2]?.visits).toBe(0);
  expect(JSON.stringify(result)).not.toMatch(
    /Excellent coffee|feedbackText|ownerId|password/,
  );
});

test("empty and expenses-only businesses return honest states and negative profit", async () => {
  const business = await makeBusiness();
  let result = await getDashboard(db, owner, business.id, fixturePeriod, now);
  expect(result.current).toMatchObject({
    profit: "0",
    margin: null,
    averageSale: null,
    costCoverage: null,
    customerDays: 0,
  });
  expect(result.hasFinancialRecords).toBe(false);
  expect(result.comparison.revenueGrowth).toBeNull();
  expect(result.topRevenue).toEqual([]);
  expect(result.categories).toEqual([]);
  const rent = await db.expenseCategory.findFirstOrThrow({
    where: { businessId: business.id, name: "Rent" },
  });
  await saveRecord(db, owner, business.id, "expenses", {
    expenseDate: "2024-02-22",
    amount: "10",
    categoryId: rent.id,
  });
  result = await getDashboard(db, owner, business.id, fixturePeriod, now);
  expect(result.current).toMatchObject({
    profit: "-10",
    margin: null,
    costCoverage: null,
  });
  expect(result.hasFinancialRecords).toBe(true);
});

test("PostgreSQL retains fractional quantity × cost precision until presentation", async () => {
  const business = await makeBusiness();
  for (const quantity of ["0.001", "0.002"])
    await saveRecord(db, owner, business.id, "sales", {
      saleDate: "2024-02-22",
      productServiceId: null,
      quantity,
      unitPrice: "100",
      unitCost: "0.0001",
      costMode: "EXPLICIT",
    });
  const result = await getDashboard(db, owner, business.id, fixturePeriod, now);
  expect(result.current).toMatchObject({
    revenue: "0.3",
    cogs: "0.0000003",
    profit: "0.2999997",
    costCoverage: "100.00",
  });
});

test("top lists are bounded and grouped remainder preserves the whole expense total", async () => {
  const business = await makeBusiness();
  for (let index = 0; index < 10; index++) {
    const category = await saveRecord(
      db,
      owner,
      business.id,
      "expense-categories",
      { name: `Custom ${index}`, classification: "OPERATING" },
    );
    await saveRecord(db, owner, business.id, "expenses", {
      expenseDate: "2024-02-22",
      categoryId: category.id,
      amount: String(index + 1),
    });
    const product = await saveRecord(db, owner, business.id, "products", {
      name: `Item ${index}`,
      type: "PRODUCT",
      sellingPrice: "1",
      costPrice: "0",
      active: true,
    });
    await saveRecord(db, owner, business.id, "sales", {
      saleDate: "2024-02-22",
      productServiceId: product.id,
      quantity: "1",
      unitPrice: String(index + 1),
      unitCost: null,
      costMode: "CATALOG",
    });
  }
  const result = await getDashboard(db, owner, business.id, fixturePeriod, now);
  expect(result.topRevenue).toHaveLength(5);
  expect(result.topRevenue[0]?.name).toBe("Item 9");
  expect(result.bestSelling).toHaveLength(5);
  expect(result.categories).toHaveLength(9);
  expect(result.categories[8]).toEqual({
    name: "Additional categories",
    classification: "MIXED",
    amount: "3",
  });
  expect(result.current.totalExpenses).toBe("55");
});

test("another business never contributes to totals and ADMIN cannot access a foreign dashboard", async () => {
  const first = await dashboardFixture(db, owner);
  const second = await makeBusiness();
  expect(
    (await getDashboard(db, owner, second.id, fixturePeriod, now)).current
      .revenue,
  ).toBe("0");
  await expect(
    getDashboard(db, outsider, first.business.id, fixturePeriod, now),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    getDashboard(db, owner, "missingbusiness", fixturePeriod, now),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    getDashboard(db, "missinguser", first.business.id, fixturePeriod, now),
  ).rejects.toMatchObject({ status: 401 });
});

test("services recheck suspension and reject invalid queries without fallback", async () => {
  const business = await makeBusiness();
  await expect(
    getDashboard(
      db,
      owner,
      business.id,
      { period: "custom", from: "2024-02-30", to: "2024-03-01" },
      now,
    ),
  ).rejects.toThrow();
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  try {
    await expect(
      getDashboard(db, owner, business.id, {}, now),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
});
