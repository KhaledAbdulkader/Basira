import type { PrismaClient } from "../../src/generated/prisma/client";
import { createBusiness } from "../../src/lib/business/service";
import { alertPeriod } from "../../src/lib/alerts/engine";
import { addDays } from "../../src/lib/dashboard/period";
import { parseDate } from "../../src/lib/records/dates";

// Synthetic data only, used by isolated PostgreSQL/browser tests, never a dev seed.
export async function alertFixture(
  db: PrismaClient,
  ownerId: string,
  now = new Date(),
) {
  const business = await createBusiness(db, ownerId, {
    name: "Alert cafe",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  const period = alertPeriod(business.timezone, now),
    prior = addDays(period.from, -1);
  const categories = await db.expenseCategory.findMany({
    where: { businessId: business.id },
  });
  const rent = categories.find((c) => c.name === "Rent")!,
    inventory = categories.find((c) => c.name === "Inventory")!;
  await db.salesRecord.createMany({
    data: [
      {
        businessId: business.id,
        saleDate: parseDate(prior),
        quantity: "1",
        unitPrice: "100",
        unitCost: "50",
        totalAmount: "100",
      },
      {
        businessId: business.id,
        saleDate: parseDate(period.to),
        quantity: "1",
        unitPrice: "70",
        unitCost: "60",
        totalAmount: "70",
      },
    ],
  });
  await db.expenseRecord.createMany({
    data: [
      {
        businessId: business.id,
        categoryId: rent.id,
        classification: "OPERATING",
        expenseDate: parseDate(prior),
        amount: "10",
      },
      {
        businessId: business.id,
        categoryId: rent.id,
        classification: "OPERATING",
        expenseDate: parseDate(period.to),
        amount: "8",
      },
      {
        businessId: business.id,
        categoryId: inventory.id,
        classification: "INVENTORY_PURCHASE",
        expenseDate: parseDate(period.to),
        amount: "7",
      },
    ],
  });
  await db.customerFeedback.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({
      businessId: business.id,
      feedbackDate: parseDate(period.to),
      feedbackText: `Synthetic comment ${i}`,
      sentiment: i < 3 ? ("NEGATIVE" as const) : ("POSITIVE" as const),
      topic: "staff",
      aiSummary: "Synthetic summary",
      confidence: "0.9",
      analysisStatus: "ANALYZED" as const,
    })),
  });
  return { business, period, prior, rent, inventory };
}
