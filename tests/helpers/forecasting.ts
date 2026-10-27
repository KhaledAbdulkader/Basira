import type { PrismaClient } from "../../src/generated/prisma/client";
import { createBusiness } from "../../src/lib/business/service";
import { businessToday, parseDate } from "../../src/lib/records/dates";
import { addDays } from "../../src/lib/dashboard/period";

// Synthetic histories are created only by isolated database/browser tests.
export async function forecastFixture(
  db: PrismaClient,
  ownerId: string,
  {
    days = 14,
    spacing = 1,
    metric = "REVENUE",
    now = new Date(),
    value = "10",
  }: {
    days?: number;
    spacing?: number;
    metric?: "REVENUE" | "EXPENSE";
    now?: Date;
    value?: string;
  } = {},
) {
  const business = await createBusiness(db, ownerId, {
    name: "Forecast cafe",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  const yesterday = addDays(businessToday(business.timezone, now), -1);
  const dates = Array.from({ length: days }, (_, i) =>
    addDays(yesterday, -i * spacing),
  ).reverse();
  if (metric === "REVENUE")
    await db.salesRecord.createMany({
      data: dates.map((date) => ({
        businessId: business.id,
        saleDate: parseDate(date),
        quantity: "1",
        unitPrice: value,
        unitCost: null,
        totalAmount: value,
      })),
    });
  else {
    const categories = await db.expenseCategory.findMany({
      where: {
        businessId: business.id,
        name: { in: ["Rent", "Inventory", "Other"] },
      },
      orderBy: { name: "asc" },
    });
    await db.expenseRecord.createMany({
      data: dates.map((date, i) => ({
        businessId: business.id,
        categoryId: categories[i % categories.length]!.id,
        classification: categories[i % categories.length]!.classification,
        expenseDate: parseDate(date),
        amount: value,
      })),
    });
  }
  return business;
}
