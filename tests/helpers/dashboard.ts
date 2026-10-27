import type { PrismaClient } from "../../src/generated/prisma/client";
import { createBusiness } from "../../src/lib/business/service";
import { saveRecord } from "../../src/lib/records/service";

// Isolated test data only; never invoked by the application or development seed.
export async function dashboardFixture(db: PrismaClient, ownerId: string) {
  const business = await createBusiness(db, ownerId, {
    name: "Olive & Oak Cafe",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  const product = await saveRecord(db, ownerId, business.id, "products", {
    name: "Latte",
    type: "PRODUCT",
    sellingPrice: "10",
    costPrice: "3",
    active: true,
  });
  const categories = await db.expenseCategory.findMany({
    where: { businessId: business.id },
  });
  const rent = categories.find((row) => row.name === "Rent")!;
  const inventory = categories.find((row) => row.name === "Inventory")!;
  const other = categories.find((row) => row.name === "Other")!;
  const sales = [
    {
      saleDate: "2024-02-14",
      unitPrice: "999",
      quantity: "1",
      unitCost: "0",
      productServiceId: null,
    },
    {
      saleDate: "2024-02-21",
      unitPrice: "100",
      quantity: "1",
      unitCost: "20",
      productServiceId: null,
    },
    {
      saleDate: "2024-02-22",
      unitPrice: "10",
      quantity: "10",
      unitCost: "3",
      productServiceId: product.id,
    },
    {
      saleDate: "2024-02-24",
      unitPrice: "10",
      quantity: "5",
      unitCost: null,
      productServiceId: null,
    },
    {
      saleDate: "2024-02-28",
      unitPrice: "0",
      quantity: "1",
      unitCost: "0",
      productServiceId: product.id,
    },
    {
      saleDate: "2024-02-29",
      unitPrice: "999",
      quantity: "1",
      unitCost: "0",
      productServiceId: null,
    },
  ];
  for (const sale of sales)
    await saveRecord(db, ownerId, business.id, "sales", {
      ...sale,
      costMode: "EXPLICIT",
    });
  for (const expense of [
    { expenseDate: "2024-02-21", amount: "10", categoryId: rent.id },
    { expenseDate: "2024-02-22", amount: "20", categoryId: rent.id },
    { expenseDate: "2024-02-24", amount: "60", categoryId: inventory.id },
    { expenseDate: "2024-02-28", amount: "5", categoryId: other.id },
  ])
    await saveRecord(db, ownerId, business.id, "expenses", expense);
  for (const metric of [
    { metricDate: "2024-02-21", customerCount: 10 },
    { metricDate: "2024-02-22", customerCount: 30 },
    { metricDate: "2024-02-24", customerCount: 0 },
  ])
    await saveRecord(db, ownerId, business.id, "customer-metrics", metric);
  await db.customerFeedback.createMany({
    data: [
      {
        businessId: business.id,
        feedbackDate: new Date("2024-02-22"),
        feedbackText: "Excellent coffee",
        sentiment: "POSITIVE",
        analysisStatus: "ANALYZED",
      },
      {
        businessId: business.id,
        feedbackDate: new Date("2024-02-24"),
        feedbackText: "Awaiting analysis",
        sentiment: "UNKNOWN",
        analysisStatus: "PENDING",
      },
      {
        businessId: business.id,
        feedbackDate: new Date("2024-02-24"),
        feedbackText: "Another pending entry",
        sentiment: "UNKNOWN",
        analysisStatus: "PENDING",
      },
      {
        businessId: business.id,
        feedbackDate: new Date("2024-02-28"),
        feedbackText: "Failed analysis",
        sentiment: "NEGATIVE",
        analysisStatus: "FAILED",
      },
    ],
  });
  return { business, product, rent };
}
export const fixturePeriod = {
  period: "custom",
  from: "2024-02-22",
  to: "2024-02-28",
};
