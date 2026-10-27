import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, test, expect } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { testDatabase as db } from "../helpers/database";
import { csv } from "../helpers/imports";
import {
  createBusiness,
  getOwnedBusiness,
  deleteBusiness,
  updateBusiness,
} from "@/lib/business/service";
import { saveRecord, deleteRecord } from "@/lib/records/service";
import {
  previewImport,
  confirmImport,
  listImports,
  getImport,
} from "@/lib/imports/service";
import type { ImportType, ParsedFile } from "@/lib/imports/constants";

let owner: string, outsider: string;
const secret = "a test only preview signing secret";
const input = {
  name: "Import cafe",
  businessType: "CAFE",
  currency: "SAR",
  timezone: "Asia/Riyadh",
};
const product = {
  name: "Latte",
  type: "PRODUCT",
  sellingPrice: "10",
  costPrice: "3",
  active: true,
};
const business = () => createBusiness(db, owner, input);
const preview = (id: string, type: ImportType, file: ParsedFile) =>
  previewImport(db, owner, id, type, file, secret);
async function run(id: string, type: ImportType, file: ParsedFile) {
  const p = await preview(id, type, file);
  return confirmImport(db, owner, id, type, file, p.token, true, secret);
}
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@imports-test.example` },
    })
  ).id;
  outsider = (
    await db.user.create({
      data: { email: `${randomUUID()}@imports-test.example`, role: "ADMIN" },
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
test("preview is read-only, confirmed catalog rows lock settings and keep provenance through edits", async () => {
  const b = await business();
  const file = await csv(
    "item_name,type,selling_price,cost_price\nLatte,PRODUCT,10,3\nAdvice,SERVICE,0,",
    "PRODUCTS",
  );
  const p = await preview(b.id, "PRODUCTS", file);
  expect(p.validRows).toBe(2);
  expect(await db.productService.count({ where: { businessId: b.id } })).toBe(
    0,
  );
  expect(await db.dataImport.count({ where: { businessId: b.id } })).toBe(0);
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
  const result = await confirmImport(
    db,
    owner,
    b.id,
    "PRODUCTS",
    file,
    p.token,
    true,
    secret,
  );
  expect(result.item).toMatchObject({
    status: "COMPLETED",
    importedRows: 2,
    failedRows: 0,
  });
  const saved = await db.productService.findFirstOrThrow({
    where: { businessId: b.id, name: "Latte" },
  });
  expect(saved).toMatchObject({
    source: "IMPORT",
    dataImportId: result.item.id,
  });
  await saveRecord(
    db,
    owner,
    b.id,
    "products",
    { ...product, version: saved.version, sellingPrice: "12" },
    saved.id,
  );
  expect(
    await db.productService.findUnique({ where: { id: saved.id } }),
  ).toMatchObject({ source: "IMPORT", dataImportId: result.item.id });
  const current = await getOwnedBusiness(db, owner, b.id);
  expect(current.financialSettingsLockedAt).not.toBeNull();
  await expect(
    updateBusiness(db, owner, b.id, {
      ...input,
      version: current.version,
      currency: "USD",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
test("partial sales import preserves historical cost snapshots, exact totals and row errors", async () => {
  const b = await business();
  await saveRecord(db, owner, b.id, "products", product);
  const file = await csv(
    "date,item_name,quantity,unit_price,unit_cost,total_amount\n2026-09-20, latte ,3,0.1,,0.30\n2026-09-20,Latte,2,10,0,20\n2026-09-20,Missing,1,5,,5",
    "SALES",
  );
  const result = await run(b.id, "SALES", file);
  expect(result.item).toMatchObject({
    status: "PARTIAL",
    totalRows: 3,
    importedRows: 2,
    failedRows: 1,
  });
  const sales = await db.salesRecord.findMany({
    where: { businessId: b.id },
    orderBy: { totalAmount: "asc" },
  });
  expect(sales[0]!.totalAmount.toFixed()).toBe("0.3");
  expect(sales[0]!.unitCost).toBeNull();
  expect(sales[1]!.unitCost!.toFixed()).toBe("0");
  expect(
    sales.every(
      (row) => row.dataImportId === result.item.id && row.source === "IMPORT",
    ),
  ).toBe(true);
  const detail = await getImport(db, owner, b.id, result.item.id);
  expect(detail.validationErrors).toEqual([
    { row: 4, errors: [expect.stringContaining("no matching")] },
  ]);
  await deleteRecord(db, owner, b.id, "sales", sales[0]!.id, {
    version: 1,
    confirmed: true,
  });
  expect((await getImport(db, owner, b.id, result.item.id)).importedRows).toBe(
    2,
  );
});
test("expense classifications are revalidated at confirmation and then retained historically", async () => {
  const b = await business();
  const file = await csv(
    "date,category,amount\n2026-09-20,Rent,10\n2026-09-20,Inventory,20\n2026-09-20,Other,2",
    "EXPENSES",
  );
  const p = await preview(b.id, "EXPENSES", file);
  const rent = await db.expenseCategory.findFirstOrThrow({
    where: { businessId: b.id, name: "Rent" },
  });
  await saveRecord(
    db,
    owner,
    b.id,
    "expense-categories",
    { name: "Rent", classification: "OTHER", version: rent.version },
    rent.id,
  );
  await expect(
    confirmImport(db, owner, b.id, "EXPENSES", file, p.token, true, secret),
  ).rejects.toMatchObject({ status: 409 });
  expect(await db.dataImport.count({ where: { businessId: b.id } })).toBe(0);
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
  await run(b.id, "EXPENSES", file);
  expect(
    (
      await db.expenseRecord.findFirstOrThrow({
        where: { businessId: b.id, categoryId: rent.id },
      })
    ).classification,
  ).toBe("OTHER");
  await saveRecord(
    db,
    owner,
    b.id,
    "expense-categories",
    { name: "Rent", classification: "OPERATING", version: rent.version + 1 },
    rent.id,
  );
  expect(
    (
      await db.expenseRecord.findFirstOrThrow({
        where: { businessId: b.id, categoryId: rent.id },
      })
    ).classification,
  ).toBe("OTHER");
});
test("double-click and concurrent confirmation import only once; repeat file preview is rejected", async () => {
  const b = await business();
  const file = await csv("date,feedback_text\n2026-09-20,Good", "FEEDBACK");
  const p = await preview(b.id, "FEEDBACK", file);
  const results = await Promise.all(
    [1, 2].map(() =>
      confirmImport(db, owner, b.id, "FEEDBACK", file, p.token, true, secret),
    ),
  );
  expect(new Set(results.map((result) => result.item.id)).size).toBe(1);
  expect(results.map((result) => result.alreadyImported).sort()).toEqual([
    false,
    true,
  ]);
  expect(await db.customerFeedback.count({ where: { businessId: b.id } })).toBe(
    1,
  );
  expect(
    await db.customerFeedback.findFirst({ where: { businessId: b.id } }),
  ).toMatchObject({
    source: "IMPORT",
    sentiment: "UNKNOWN",
    analysisStatus: "PENDING",
    aiSummary: null,
  });
  await expect(
    preview(b.id, "FEEDBACK", { ...file, fileName: "renamed.csv" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await confirmImport(
        db,
        owner,
        b.id,
        "FEEDBACK",
        file,
        p.token,
        true,
        secret,
        Date.now() + 3600000,
      )
    ).alreadyImported,
  ).toBe(true);
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
});
test("concurrent daily counts serialize and never replace the existing day", async () => {
  const b = await business();
  const files = await Promise.all(
    [3, 4].map((count) =>
      csv(`date,customer_count\n2026-09-20,${count}`, "CUSTOMER_METRICS"),
    ),
  );
  const previews = await Promise.all(
    files.map((file) => preview(b.id, "CUSTOMER_METRICS", file)),
  );
  const results = await Promise.allSettled(
    files.map((file, i) =>
      confirmImport(
        db,
        owner,
        b.id,
        "CUSTOMER_METRICS",
        file,
        previews[i]!.token,
        true,
        secret,
      ),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  expect(await db.customerMetric.count({ where: { businessId: b.id } })).toBe(
    1,
  );
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
});
test("expired, unconfirmed, changed-file and wrong-business previews cannot write", async () => {
  const b = await business(),
    other = await business();
  const file = await csv("date,feedback_text\n2026-09-20,Fine", "FEEDBACK");
  const p = await preview(b.id, "FEEDBACK", file);
  await expect(
    confirmImport(db, owner, b.id, "FEEDBACK", file, p.token, false, secret),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    confirmImport(
      db,
      owner,
      b.id,
      "FEEDBACK",
      file,
      p.token,
      true,
      secret,
      Date.now() + 3600000,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    confirmImport(db, owner, other.id, "FEEDBACK", file, p.token, true, secret),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    confirmImport(
      db,
      owner,
      b.id,
      "FEEDBACK",
      await csv("date,feedback_text\n2026-09-20,Changed", "FEEDBACK"),
      p.token,
      true,
      secret,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await db.dataImport.count({ where: { businessId: b.id } })).toBe(0);
});
test("financial settings changes and new conflicting catalog entries require a fresh preview", async () => {
  const b = await business();
  const file = await csv(
    "item_name,type,selling_price\nLatte,PRODUCT,10",
    "PRODUCTS",
  );
  const p = await preview(b.id, "PRODUCTS", file);
  await updateBusiness(db, owner, b.id, {
    ...input,
    version: b.version,
    currency: "USD",
  });
  await expect(
    confirmImport(db, owner, b.id, "PRODUCTS", file, p.token, true, secret),
  ).rejects.toMatchObject({ status: 409 });
  const fresh = await preview(b.id, "PRODUCTS", file);
  await saveRecord(db, owner, b.id, "products", product);
  await expect(
    confirmImport(db, owner, b.id, "PRODUCTS", file, fresh.token, true, secret),
  ).rejects.toMatchObject({ status: 409 });
});
test("owner checks apply to previews, confirmations and history even for ADMIN and suspended users", async () => {
  const b = await business();
  const file = await csv("date,feedback_text\n2026-09-20,Fine", "FEEDBACK");
  const p = await preview(b.id, "FEEDBACK", file);
  const result = await confirmImport(
    db,
    owner,
    b.id,
    "FEEDBACK",
    file,
    p.token,
    true,
    secret,
  );
  await expect(
    previewImport(db, outsider, b.id, "FEEDBACK", file, secret),
  ).rejects.toMatchObject({ status: 404 });
  await expect(listImports(db, outsider, b.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    getImport(db, outsider, b.id, result.item.id),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    confirmImport(db, outsider, b.id, "FEEDBACK", file, p.token, true, secret),
  ).rejects.toMatchObject({ status: 409 });
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  try {
    await expect(listImports(db, owner, b.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      confirmImport(db, owner, b.id, "FEEDBACK", file, p.token, true, secret),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
});
test("zero-valid previews cannot create history and import details remain business-scoped", async () => {
  const b = await business(),
    other = await business();
  const file = await csv(
    "date,customer_count\n2026-02-30,-1",
    "CUSTOMER_METRICS",
  );
  const p = await preview(b.id, "CUSTOMER_METRICS", file);
  expect(p.validRows).toBe(0);
  await expect(
    confirmImport(
      db,
      owner,
      b.id,
      "CUSTOMER_METRICS",
      file,
      p.token,
      true,
      secret,
    ),
  ).rejects.toMatchObject({ status: 422 });
  expect((await listImports(db, owner, b.id)).total).toBe(0);
  const result = await run(
    b.id,
    "FEEDBACK",
    await csv("date,feedback_text\n2026-09-20,Fine", "FEEDBACK"),
  );
  await expect(
    getImport(db, owner, other.id, result.item.id),
  ).rejects.toMatchObject({ status: 404 });
});
test("unexpected batch failure rolls back records, history and the permanent financial marker", async () => {
  const b = await business();
  const file = await csv(
    "item_name,type,selling_price\nLatte,PRODUCT,10\nTea,PRODUCT,5",
    "PRODUCTS",
  );
  const p = await preview(b.id, "PRODUCTS", file);
  const failing = db.$extends({
    query: {
      productService: {
        async createMany({ args, query }) {
          await query(args);
          throw new Error("Injected failure after database insert");
        },
      },
    },
  }) as unknown as PrismaClient;
  await expect(
    confirmImport(
      failing,
      owner,
      b.id,
      "PRODUCTS",
      file,
      p.token,
      true,
      secret,
    ),
  ).rejects.toThrow("Injected failure");
  expect(await db.productService.count({ where: { businessId: b.id } })).toBe(
    0,
  );
  expect(await db.dataImport.count({ where: { businessId: b.id } })).toBe(0);
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
});
test("database constraints enforce import business/provenance and business deletion removes the entire graph", async () => {
  const b = await business(),
    other = await business();
  const productImport = await run(
    b.id,
    "PRODUCTS",
    await csv("item_name,type,selling_price\nLatte,PRODUCT,10", "PRODUCTS"),
  );
  await run(
    b.id,
    "SALES",
    await csv(
      "date,item_name,quantity,unit_price\n2026-09-20,Latte,1,10",
      "SALES",
    ),
  );
  await run(
    b.id,
    "EXPENSES",
    await csv("date,category,amount\n2026-09-20,Rent,2", "EXPENSES"),
  );
  await run(
    b.id,
    "CUSTOMER_METRICS",
    await csv("date,customer_count\n2026-09-20,3", "CUSTOMER_METRICS"),
  );
  await run(
    b.id,
    "FEEDBACK",
    await csv("date,feedback_text\n2026-09-20,Fine", "FEEDBACK"),
  );
  await expect(
    db.productService.create({
      data: {
        ...product,
        businessId: other.id,
        type: "PRODUCT",
        source: "IMPORT",
        dataImportId: productImport.item.id,
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  await expect(
    db.customerFeedback.create({
      data: {
        businessId: b.id,
        feedbackDate: new Date("2026-09-21"),
        feedbackText: "Invalid source",
        source: "IMPORT",
      },
    }),
  ).rejects.toThrow();
  const current = await getOwnedBusiness(db, owner, b.id);
  await deleteBusiness(db, owner, b.id, {
    version: current.version,
    confirmationName: current.name,
  });
  const where = { businessId: b.id };
  expect(
    await Promise.all([
      db.dataImport.count({ where }),
      db.productService.count({ where }),
      db.salesRecord.count({ where }),
      db.expenseRecord.count({ where }),
      db.customerMetric.count({ where }),
      db.customerFeedback.count({ where }),
    ]),
  ).toEqual([0, 0, 0, 0, 0, 0]);
});
test("history is bounded to twenty newest imports per page", async () => {
  const b = await business();
  await db.dataImport.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      businessId: b.id,
      fileName: `${i}.csv`,
      fileHash: i.toString(16).padStart(64, "0"),
      fileType: "CSV" as const,
      importType: "FEEDBACK" as const,
      status: "COMPLETED" as const,
      totalRows: 1,
      importedRows: 1,
      failedRows: 0,
      validationErrors: [],
      createdAt: new Date(1700000000000 + i * 1000),
    })),
  });
  const first = await listImports(db, owner, b.id),
    second = await listImports(db, owner, b.id, 2);
  expect(first.total).toBe(21);
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(1);
  expect(first.items[0]!.fileName).toBe("20.csv");
  expect(second.items[0]!.fileName).toBe("0.csv");
});
