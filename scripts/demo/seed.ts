import type {
  PrismaClient,
  ProductService,
} from "../../src/generated/prisma/client";
import { hashPassword } from "../../src/lib/auth/password";
import { passwordSchema } from "../../src/lib/validation/auth";
import { createDefaultCategories } from "../../src/lib/records/defaults";
import { createDefaultAlertRules } from "../../src/lib/alerts/defaults";
import { buildDemoData, DEMO_EMAIL, DEMO_USER_ID, DEMO_TIMEZONE } from "./data";

export class DemoSeedError extends Error {}

export async function seedDemo(
  db: PrismaClient,
  password: string,
  endDate: string,
) {
  passwordSchema.parse(password);
  const data = buildDemoData(endDate);
  const passwordHash = await hashPassword(password);
  return db.$transaction(
    async (tx) => {
      // Serialize repeated invocations, including before the owner row exists.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(140014)`;
      const existing = await tx.user.findFirst({
        where: { OR: [{ id: DEMO_USER_ID }, { email: DEMO_EMAIL }] },
      });
      if (existing) {
        if (existing.id !== DEMO_USER_ID || existing.email !== DEMO_EMAIL)
          throw new DemoSeedError(
            "The reserved demo identity is already in use. No accounts were changed.",
          );
        return {
          created: false,
          businesses: await tx.business.findMany({
            where: { ownerId: DEMO_USER_ID },
            select: { id: true, name: true },
          }),
        };
      }
      await tx.user.create({
        data: {
          id: DEMO_USER_ID,
          email: DEMO_EMAIL,
          name: "Basira Demo Owner",
          passwordHash,
        },
      });
      const businesses = [];
      for (const recipe of data) {
        const business = await tx.business.create({
          data: {
            ownerId: DEMO_USER_ID,
            name: recipe.name,
            businessType: recipe.businessType,
            location: recipe.location,
            currency: "SAR",
            timezone: DEMO_TIMEZONE,
          },
        });
        businesses.push({ id: business.id, name: business.name });
        await createDefaultCategories(tx, business.id);
        await createDefaultAlertRules(tx, business.id);
        const categories = await tx.expenseCategory.findMany({
          where: { businessId: business.id },
        });
        const products: ProductService[] = [];
        for (const product of recipe.products)
          products.push(
            await tx.productService.create({
              data: { ...product, businessId: business.id },
            }),
          );
        // Chunk inserts; database triggers maintain the permanent settings lock.
        for (let offset = 0; offset < recipe.sales.length; offset += 400)
          await tx.salesRecord.createMany({
            data: recipe.sales
              .slice(offset, offset + 400)
              .map(({ productIndex, ...sale }) => ({
                ...sale,
                businessId: business.id,
                productServiceId: products[productIndex]!.id,
                itemName: products[productIndex]!.name,
              })),
          });
        await tx.expenseRecord.createMany({
          data: recipe.expenses.map(({ categoryName, ...expense }) => {
            const category = categories.find(
              (item) => item.name === categoryName,
            )!;
            return {
              ...expense,
              businessId: business.id,
              categoryId: category.id,
              classification: category.classification,
            };
          }),
        });
        await tx.customerMetric.createMany({
          data: recipe.customers.map((row) => ({
            ...row,
            businessId: business.id,
          })),
        });
        // Never fabricate provider results, chats, reports, imports, or predictions.
        await tx.customerFeedback.createMany({
          data: recipe.feedback.map((row) => ({
            ...row,
            businessId: business.id,
          })),
        });
      }
      return { created: true, businesses };
    },
    { maxWait: 10000, timeout: 60000 },
  );
}
