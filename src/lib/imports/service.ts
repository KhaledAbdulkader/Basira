import { evaluateAlertsInTransaction } from "@/lib/alerts/evaluation";
import {
  Prisma,
  type PrismaClient,
  type DataImport,
} from "@/generated/prisma/client";
import {
  getOwnedBusiness,
  lockOwnedBusiness,
  lockFinancialSettings,
  BusinessError,
} from "@/lib/business/service";
import { dateOnly, parseDate } from "@/lib/records/dates";
import { dateSchema, recordIdSchema } from "@/lib/validation/records";
import {
  IMPORT_LIMITS,
  type ImportType,
  type ParsedFile,
  type PreviewRow,
  type ImportHistoryItem,
  type ImportPreview,
} from "./constants";
import { ImportError } from "./errors";
import {
  importPageSchema,
  validateImportRows,
  type ImportContext,
} from "./validation";
import { reviewHash, signPreview, verifyPreview } from "./token";

type Database = PrismaClient | Prisma.TransactionClient;
function history(item: DataImport): ImportHistoryItem {
  return {
    id: item.id,
    fileName: item.fileName,
    fileType: item.fileType,
    importType: item.importType,
    status: item.status,
    totalRows: item.totalRows,
    importedRows: item.importedRows,
    failedRows: item.failedRows,
    createdAt: item.createdAt.toISOString(),
  };
}
async function review(
  db: Database,
  business: { id: string; currency: string; timezone: string },
  file: ParsedFile,
  type: ImportType,
) {
  const names = [
    ...new Set(
      file.rows
        .map((row) => row.values.item_name)
        .filter((name): name is string => !!name),
    ),
  ];
  const categoryNames = [
    ...new Set(
      file.rows
        .map((row) => row.values.category)
        .filter((name): name is string => !!name),
    ),
  ];
  const dates = [
    ...new Set(
      file.rows
        .map((row) => row.values.date)
        .filter((date): date is string => dateSchema.safeParse(date).success),
    ),
  ];
  const context: ImportContext = {
    currency: business.currency,
    products:
      type === "PRODUCTS" || type === "SALES"
        ? await db.productService.findMany({
            where: {
              businessId: business.id,
              name: { in: names, mode: "insensitive" },
            },
            select: { id: true, name: true, active: true },
            orderBy: { id: "asc" },
          })
        : [],
    categories:
      type === "EXPENSES"
        ? await db.expenseCategory.findMany({
            where: {
              businessId: business.id,
              name: { in: categoryNames, mode: "insensitive" },
            },
            select: { id: true, name: true, classification: true },
            orderBy: { id: "asc" },
          })
        : [],
    customerDates:
      type === "CUSTOMER_METRICS"
        ? (
            await db.customerMetric.findMany({
              where: {
                businessId: business.id,
                metricDate: { in: dates.map(parseDate) },
              },
              select: { metricDate: true },
            })
          ).map((row) => dateOnly(row.metricDate))
        : [],
  };
  const rows = validateImportRows(file, type, context);
  const payload = {
    businessId: business.id,
    currency: business.currency,
    timezone: business.timezone,
    fileName: file.fileName,
    fileType: file.fileType,
    fileHash: file.fileHash,
    importType: type,
    headers: file.headers,
    rows,
  };
  return { rows, hash: reviewHash(payload) };
}
const identity = (
  businessId: string,
  importType: ImportType,
  fileHash: string,
) => ({ businessId_importType_fileHash: { businessId, importType, fileHash } });

export async function previewImport(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  type: ImportType,
  file: ParsedFile,
  secret: string,
  now = Date.now(),
): Promise<ImportPreview> {
  return db.$transaction(
    async (tx) => {
      const business = await getOwnedBusiness(tx, actorId, businessId);
      if (
        await tx.dataImport.findUnique({
          where: identity(businessId, type, file.fileHash),
        })
      )
        throw new ImportError(
          409,
          "This exact file was already imported for this data type. Check import history. To retry skipped rows, upload a corrected file containing only those rows.",
        );
      const result = await review(tx, business, file, type);
      const expires = now + IMPORT_LIMITS.previewMinutes * 60000;
      const validRows = result.rows.filter(
        (row) => row.resolved && !row.errors.length,
      ).length;
      return {
        token: signPreview(
          {
            version: 1,
            actorId,
            businessId,
            importType: type,
            fileHash: file.fileHash,
            reviewHash: result.hash,
            expires,
          },
          secret,
        ),
        expiresAt: new Date(expires).toISOString(),
        fileName: file.fileName,
        fileType: file.fileType,
        importType: type,
        businessId,
        currency: business.currency,
        timezone: business.timezone,
        totalRows: result.rows.length,
        validRows,
        invalidRows: result.rows.length - validRows,
        headers: file.headers,
        rows: result.rows,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

// Values here are produced only by server validation immediately before writing.
// No normalized rows, calculated totals, or ownership fields are accepted from clients.
async function writeRows(
  tx: Prisma.TransactionClient,
  businessId: string,
  dataImportId: string,
  type: ImportType,
  rows: PreviewRow[],
) {
  const common = { businessId, dataImportId, source: "IMPORT" as const };
  const data = rows.map((row) => row.resolved!);
  switch (type) {
    case "PRODUCTS":
      await tx.productService.createMany({
        data: data.map((v) => ({
          ...common,
          name: String(v.name),
          type: v.type as "PRODUCT" | "SERVICE",
          category: v.category as string | null,
          costPrice: v.costPrice as string | null,
          sellingPrice: String(v.sellingPrice),
          active: true,
        })),
      });
      break;
    case "SALES":
      await tx.salesRecord.createMany({
        data: data.map((v) => ({
          ...common,
          productServiceId: String(v.productServiceId),
          itemName: String(v.itemName),
          saleDate: parseDate(String(v.saleDate)),
          quantity: String(v.quantity),
          unitPrice: String(v.unitPrice),
          unitCost: v.unitCost as string | null,
          totalAmount: String(v.totalAmount),
          note: v.note as string | null,
        })),
      });
      break;
    case "EXPENSES":
      await tx.expenseRecord.createMany({
        data: data.map((v) => ({
          ...common,
          categoryId: String(v.categoryId),
          classification: v.classification as
            "OPERATING" | "INVENTORY_PURCHASE" | "OTHER",
          expenseDate: parseDate(String(v.expenseDate)),
          amount: String(v.amount),
          description: v.description as string | null,
        })),
      });
      break;
    case "CUSTOMER_METRICS":
      await tx.customerMetric.createMany({
        data: data.map((v) => ({
          ...common,
          metricDate: parseDate(String(v.metricDate)),
          customerCount: Number(v.customerCount),
        })),
      });
      break;
    case "FEEDBACK":
      await tx.customerFeedback.createMany({
        data: data.map((v) => ({
          ...common,
          feedbackDate: parseDate(String(v.feedbackDate)),
          feedbackText: String(v.feedbackText),
        })),
      });
      break;
  }
}
export async function confirmImport(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  type: ImportType,
  file: ParsedFile,
  token: string,
  confirmed: boolean,
  secret: string,
  now = Date.now(),
) {
  if (confirmed !== true)
    throw new ImportError(
      400,
      "Review the preview and explicitly confirm which rows will be imported.",
    );
  const claims = verifyPreview(token, secret);
  if (
    claims.actorId !== actorId ||
    claims.businessId !== businessId ||
    claims.importType !== type ||
    claims.fileHash !== file.fileHash
  )
    throw new ImportError(
      409,
      "The file or business does not match this preview. Preview again.",
    );
  return db.$transaction(
    async (tx) => {
      const business = await lockOwnedBusiness(tx, actorId, businessId);
      const existing = await tx.dataImport.findUnique({
        where: identity(businessId, type, file.fileHash),
      });
      if (existing) return { item: history(existing), alreadyImported: true };
      if (claims.expires <= now)
        throw new ImportError(
          409,
          "This preview expired. Preview the file again before importing.",
        );
      const result = await review(tx, business, file, type);
      if (result.hash !== claims.reviewHash)
        throw new ImportError(
          409,
          "Business data changed since this preview. Preview again to review the updated results.",
        );
      const valid = result.rows.filter(
        (row) => row.resolved && !row.errors.length,
      );
      if (!valid.length)
        throw new ImportError(
          422,
          "There are no valid rows to import. Correct the file and preview again.",
        );
      if (["PRODUCTS", "SALES", "EXPENSES"].includes(type))
        await lockFinancialSettings(tx, actorId, businessId);
      const failedRows = result.rows.length - valid.length;
      const item = await tx.dataImport.create({
        data: {
          businessId,
          fileName: file.fileName,
          fileType: file.fileType,
          fileHash: file.fileHash,
          importType: type,
          status: failedRows ? "PARTIAL" : "COMPLETED",
          totalRows: result.rows.length,
          importedRows: valid.length,
          failedRows,
          validationErrors: result.rows
            .filter((row) => row.errors.length)
            .map((row) => ({ row: row.row, errors: row.errors })),
        },
      });
      await writeRows(tx, businessId, item.id, type, valid);
      if (["SALES", "EXPENSES", "FEEDBACK"].includes(type))
        await evaluateAlertsInTransaction(
          tx,
          actorId,
          businessId,
          new Date(now),
        );
      return { item: history(item), alreadyImported: false };
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function listImports(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown = 1,
) {
  const page = importPageSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      await getOwnedBusiness(tx, actorId, businessId);
      const where = { businessId };
      const [items, total] = await Promise.all([
        tx.dataImport.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        tx.dataImport.count({ where }),
      ]);
      return { items: items.map(history), total, page, pageSize: 20 };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export async function getImport(
  db: Database,
  actorId: string,
  businessId: string,
  id: string,
) {
  await getOwnedBusiness(db, actorId, businessId);
  const item = await db.dataImport.findFirst({
    where: { businessId, id: recordIdSchema.parse(id) },
  });
  if (!item) throw new BusinessError(404, "Import not found.");
  return {
    ...history(item),
    validationErrors: item.validationErrors as {
      row: number;
      errors: string[];
    }[],
  };
}
