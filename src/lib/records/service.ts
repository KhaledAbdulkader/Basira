import { z } from "zod";
import { evaluateAlertsInTransaction } from "@/lib/alerts/evaluation";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  BusinessError,
  getOwnedBusiness,
  lockFinancialSettings,
  lockOwnedBusiness,
} from "@/lib/business/service";
import {
  categorySchema,
  customerMetricSchema,
  deleteRecordSchema,
  expenseSchema,
  feedbackSchema,
  productSchema,
  recordIdSchema,
  recordQuerySchema,
  recordVersionSchema,
  saleSchema,
} from "@/lib/validation/records";
import {
  calculateSaleTotal,
  currencyPrecision,
  hasCurrencyPrecision,
} from "./money";
import { dateOnly, parseDate } from "./dates";
import {
  RECORD_RESOURCES,
  type RecordResource,
  type RecordView,
  type RecordList,
  type RecordOptions,
} from "./types";

export const resourceSchema = z.enum(RECORD_RESOURCES);
type Database = PrismaClient | Prisma.TransactionClient;
const publicFields = [
  "name",
  "type",
  "category",
  "costPrice",
  "sellingPrice",
  "active",
  "classification",
  "isDefault",
  "productServiceId",
  "itemName",
  "saleDate",
  "quantity",
  "unitPrice",
  "unitCost",
  "totalAmount",
  "note",
  "categoryId",
  "expenseDate",
  "amount",
  "description",
  "metricDate",
  "customerCount",
  "feedbackDate",
  "feedbackText",
  "sentiment",
  "topic",
  "aiSummary",
  "confidence",
  "analysisStatus",
  "analysisError",
  "analysisProvider",
  "analysisModel",
  "analysisPromptVersion",
  "analyzedAt",
  "source",
  "dataImportId",
];
function view(
  record: { id: string; version: number } & Record<string, unknown>,
): RecordView {
  const result: RecordView = { id: record.id, version: record.version };
  for (const key of publicFields) {
    const value = record[key];
    if (value instanceof Date)
      result[key] =
        key === "analyzedAt" ? value.toISOString() : dateOnly(value);
    else if (Prisma.Decimal.isDecimal(value)) result[key] = value.toFixed();
    else if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      result[key] = value;
  }
  if (
    record.category &&
    typeof record.category === "object" &&
    "name" in record.category
  )
    result.categoryName = String(record.category.name);
  return result;
}
async function findRecord(
  db: Database,
  businessId: string,
  resource: RecordResource,
  id: string,
) {
  const where = { id: recordIdSchema.parse(id), businessId };
  switch (resource) {
    case "products":
      return db.productService.findFirst({ where });
    case "sales":
      return db.salesRecord.findFirst({ where });
    case "expense-categories":
      return db.expenseCategory.findFirst({ where });
    case "expenses":
      return db.expenseRecord.findFirst({
        where,
        include: { category: { select: { name: true } } },
      });
    case "customer-metrics":
      return db.customerMetric.findFirst({ where });
    case "feedback":
      return db.customerFeedback.findFirst({ where });
  }
}
export async function getRecord(
  db: Database,
  actorId: string,
  businessId: string,
  resource: RecordResource,
  id: string,
) {
  await getOwnedBusiness(db, actorId, businessId);
  const record = await findRecord(db, businessId, resource, id);
  if (!record) throw new BusinessError(404, "Record not found.");
  return view(record);
}

export async function listRecords(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  resource: RecordResource,
  input: unknown,
): Promise<RecordList> {
  const query = recordQuerySchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await getOwnedBusiness(tx, actorId, businessId);
      const paging = {
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      };
      const dates = {
        ...(query.from ? { gte: parseDate(query.from) } : {}),
        ...(query.to ? { lte: parseDate(query.to) } : {}),
      };
      const search = { contains: query.search, mode: "insensitive" as const };
      const order = query.order;
      let records;
      let total: number;
      switch (resource) {
        case "products": {
          const where = {
            businessId,
            name: search,
            ...(query.category ? { category: query.category } : {}),
            ...(query.active === "all"
              ? {}
              : { active: query.active === "true" }),
          };
          [records, total] = await Promise.all([
            tx.productService.findMany({
              where,
              ...paging,
              orderBy: [
                query.sort === "amount"
                  ? { sellingPrice: order }
                  : { name: order },
                { id: order },
              ],
            }),
            tx.productService.count({ where }),
          ]);
          break;
        }
        case "expense-categories": {
          const where = { businessId, name: search };
          [records, total] = await Promise.all([
            tx.expenseCategory.findMany({
              where,
              ...paging,
              orderBy: [{ name: order }, { id: order }],
            }),
            tx.expenseCategory.count({ where }),
          ]);
          break;
        }
        case "sales": {
          const where: Prisma.SalesRecordWhereInput = {
            businessId,
            saleDate: dates,
            ...(query.productId ? { productServiceId: query.productId } : {}),
            ...(query.search
              ? { OR: [{ itemName: search }, { note: search }] }
              : {}),
          };
          [records, total] = await Promise.all([
            tx.salesRecord.findMany({
              where,
              ...paging,
              orderBy: [
                query.sort === "amount"
                  ? { totalAmount: order }
                  : { saleDate: order },
                { id: order },
              ],
            }),
            tx.salesRecord.count({ where }),
          ]);
          break;
        }
        case "expenses": {
          const where = {
            businessId,
            expenseDate: dates,
            ...(query.categoryId ? { categoryId: query.categoryId } : {}),
            ...(query.search ? { description: search } : {}),
          };
          [records, total] = await Promise.all([
            tx.expenseRecord.findMany({
              where,
              include: { category: { select: { name: true } } },
              ...paging,
              orderBy: [
                query.sort === "amount"
                  ? { amount: order }
                  : { expenseDate: order },
                { id: order },
              ],
            }),
            tx.expenseRecord.count({ where }),
          ]);
          break;
        }
        case "customer-metrics": {
          const where = { businessId, metricDate: dates };
          [records, total] = await Promise.all([
            tx.customerMetric.findMany({
              where,
              ...paging,
              orderBy: [{ metricDate: order }, { id: order }],
            }),
            tx.customerMetric.count({ where }),
          ]);
          break;
        }
        case "feedback": {
          const where = {
            businessId,
            feedbackDate: dates,
            feedbackText: search,
          };
          [records, total] = await Promise.all([
            tx.customerFeedback.findMany({
              where,
              ...paging,
              orderBy: [{ feedbackDate: order }, { id: order }],
            }),
            tx.customerFeedback.count({ where }),
          ]);
          break;
        }
      }
      return {
        records: records.map(view),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function getRecordOptions(
  db: Database,
  actorId: string,
  businessId: string,
): Promise<RecordOptions> {
  await getOwnedBusiness(db, actorId, businessId);
  const [products, categories] = await Promise.all([
    db.productService.findMany({
      where: { businessId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        active: true,
        sellingPrice: true,
        costPrice: true,
        category: true,
      },
    }),
    db.expenseCategory.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, classification: true },
    }),
  ]);
  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      active: product.active,
      sellingPrice: product.sellingPrice.toFixed(),
      costPrice: product.costPrice?.toFixed() ?? null,
    })),
    categories,
    productCategories: [
      ...new Set(
        products
          .map((product) => product.category)
          .filter((category): category is string => category !== null),
      ),
    ].sort(),
  };
}

// All changes serialize on the owned business. This coordinates snapshots, settings,
// category deletion, and stale-version checks without trusting client ownership fields.
export async function saveRecord(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  resource: RecordResource,
  input: unknown,
  id?: string,
): Promise<RecordView> {
  const envelope = id
    ? z.object({ version: recordVersionSchema }).loose().parse(input)
    : null;
  let body = input;
  if (envelope) {
    body = Object.fromEntries(
      Object.entries(envelope).filter(([key]) => key !== "version"),
    );
  }
  return db.$transaction(
    async (tx) => {
      const business = await lockOwnedBusiness(tx, actorId, businessId);
      const current = id
        ? await findRecord(tx, businessId, resource, id)
        : null;
      if (id && !current) throw new BusinessError(404, "Record not found.");
      if (current && current.version !== envelope?.version)
        throw new BusinessError(
          409,
          "This record changed in another window. Reload before saving.",
        );
      const where = { id, businessId };
      const version = { increment: 1 };
      const saved = await (async () => {
        switch (resource) {
          case "products": {
            const data = productSchema.parse(body);
            await lockFinancialSettings(tx, actorId, businessId);
            return view(
              current
                ? await tx.productService.update({
                    where: { ...where, id: current.id },
                    data: { ...data, version },
                  })
                : await tx.productService.create({
                    data: { ...data, businessId },
                  }),
            );
          }
          case "expense-categories": {
            const parsed = categorySchema.parse(body);
            const data = {
              ...parsed,
              normalizedName: parsed.name.toLowerCase(),
            };
            return view(
              current
                ? await tx.expenseCategory.update({
                    where: { ...where, id: current.id },
                    data: { ...data, version },
                  })
                : await tx.expenseCategory.create({
                    data: { ...data, businessId },
                  }),
            );
          }
          case "sales": {
            const parsed = saleSchema.parse(body);
            const product = parsed.productServiceId
              ? await tx.productService.findFirst({
                  where: { id: parsed.productServiceId, businessId },
                })
              : null;
            const previous =
              current && "productServiceId" in current ? current : null;
            if (parsed.productServiceId && !product)
              throw new BusinessError(
                422,
                "Choose a product from this business.",
              );
            if (
              product &&
              !product.active &&
              previous?.productServiceId !== product.id
            )
              throw new BusinessError(
                422,
                "Choose an active product or service.",
              );
            let totalAmount;
            try {
              totalAmount = calculateSaleTotal(
                parsed.quantity,
                parsed.unitPrice,
                business.currency,
              );
            } catch {
              throw new BusinessError(
                422,
                "The sale total exceeds the supported amount.",
              );
            }
            const { costMode, ...fields } = parsed;
            const data = {
              ...fields,
              saleDate: parseDate(parsed.saleDate),
              totalAmount,
              unitCost:
                costMode === "CATALOG" ? product!.costPrice : parsed.unitCost,
              itemName:
                previous?.productServiceId === parsed.productServiceId
                  ? previous.itemName
                  : (product?.name ?? null),
            };
            await lockFinancialSettings(tx, actorId, businessId);
            return view(
              current
                ? await tx.salesRecord.update({
                    where: { ...where, id: current.id },
                    data: { ...data, version },
                  })
                : await tx.salesRecord.create({
                    data: { ...data, businessId },
                  }),
            );
          }
          case "expenses": {
            const parsed = expenseSchema.parse(body);
            const category = await tx.expenseCategory.findFirst({
              where: { id: parsed.categoryId, businessId },
            });
            if (!category)
              throw new BusinessError(
                422,
                "Choose a category from this business.",
              );
            if (!hasCurrencyPrecision(parsed.amount, business.currency))
              throw new BusinessError(
                422,
                `Use at most ${currencyPrecision(business.currency)} decimal places for ${business.currency} expenses.`,
              );
            const previous =
              current && "categoryId" in current ? current : null;
            const data = {
              ...parsed,
              expenseDate: parseDate(parsed.expenseDate),
              classification:
                previous?.categoryId === parsed.categoryId
                  ? previous.classification
                  : category.classification,
            };
            await lockFinancialSettings(tx, actorId, businessId);
            return view(
              current
                ? await tx.expenseRecord.update({
                    where: { ...where, id: current.id },
                    data: { ...data, version },
                  })
                : await tx.expenseRecord.create({
                    data: { ...data, businessId },
                  }),
            );
          }
          case "customer-metrics": {
            const parsed = customerMetricSchema.parse(body);
            const data = {
              ...parsed,
              metricDate: parseDate(parsed.metricDate),
            };
            return view(
              current
                ? await tx.customerMetric.update({
                    where: { ...where, id: current.id },
                    data: { ...data, version },
                  })
                : await tx.customerMetric.create({
                    data: { ...data, businessId },
                  }),
            );
          }
          case "feedback": {
            const parsed = feedbackSchema.parse(body);
            const data = {
              ...parsed,
              feedbackDate: parseDate(parsed.feedbackDate),
              sentiment: "UNKNOWN" as const,
              analysisStatus: "PENDING" as const,
              topic: null,
              aiSummary: null,
              confidence: null,
              analyzedAt: null,
              analysisError: null,
              analysisProvider: null,
              analysisModel: null,
              analysisPromptVersion: null,
              analysisLeaseToken: null,
              analysisLeaseUntil: null,
            };
            return view(
              current
                ? await tx.customerFeedback.update({
                    where: { ...where, id: current.id },
                    data: { ...data, version },
                  })
                : await tx.customerFeedback.create({
                    data: { ...data, businessId },
                  }),
            );
          }
        }
      })();
      if (["sales", "expenses", "feedback"].includes(resource))
        await evaluateAlertsInTransaction(tx, actorId, businessId);
      return saved;
    },
    { maxWait: 10000, timeout: 20000 },
  );
}

export async function deleteRecord(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  resource: RecordResource,
  id: string,
  input: unknown,
) {
  const data = deleteRecordSchema.parse(input);
  await db.$transaction(
    async (tx) => {
      await lockOwnedBusiness(tx, actorId, businessId);
      const current = await findRecord(tx, businessId, resource, id);
      if (!current) throw new BusinessError(404, "Record not found.");
      if (current.version !== data.version)
        throw new BusinessError(
          409,
          "This record changed. Reload before deleting.",
        );
      const where = { id: current.id, businessId };
      switch (resource) {
        case "products":
          throw new BusinessError(
            422,
            "Archive products and services instead of deleting them.",
          );
        case "expense-categories":
          if (
            await tx.expenseRecord.count({
              where: { businessId, categoryId: id },
            })
          )
            throw new BusinessError(
              409,
              "This category is used by expenses. Reassign those expenses before deleting it.",
            );
          await tx.expenseCategory.delete({ where });
          break;
        case "sales":
          await tx.salesRecord.delete({ where });
          break;
        case "expenses":
          await tx.expenseRecord.delete({ where });
          break;
        case "customer-metrics":
          await tx.customerMetric.delete({ where });
          break;
        case "feedback":
          await tx.customerFeedback.delete({ where });
          break;
      }
      if (["sales", "expenses", "feedback"].includes(resource))
        await evaluateAlertsInTransaction(tx, actorId, businessId);
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
