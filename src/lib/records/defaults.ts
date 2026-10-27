import type { Prisma } from "@/generated/prisma/client";

export const DEFAULT_CATEGORIES = [
  ["Rent", "OPERATING"],
  ["Salaries", "OPERATING"],
  ["Marketing", "OPERATING"],
  ["Utilities", "OPERATING"],
  ["Supplies", "OPERATING"],
  ["Transportation", "OPERATING"],
  ["Maintenance", "OPERATING"],
  ["Inventory", "INVENTORY_PURCHASE"],
  ["Other", "OTHER"],
] as const;

export async function createDefaultCategories(
  tx: Prisma.TransactionClient,
  businessId: string,
) {
  await tx.expenseCategory.createMany({
    data: DEFAULT_CATEGORIES.map(([name, classification]) => ({
      businessId,
      name,
      normalizedName: name.toLowerCase(),
      classification,
      isDefault: true,
    })),
    skipDuplicates: true,
  });
}
