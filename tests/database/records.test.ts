import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { testDatabase as db } from "../helpers/database";
import {
  createBusiness,
  deleteBusiness,
  getOwnedBusiness,
  updateBusiness,
} from "@/lib/business/service";
import {
  getRecord,
  listRecords,
  saveRecord,
  deleteRecord,
  getRecordOptions,
} from "@/lib/records/service";
import type { RecordResource } from "@/lib/records/types";

let owner: string;
let outsider: string;
const businessInput = {
  name: "Core data cafe",
  businessType: "CAFE",
  currency: "SAR",
  timezone: "Asia/Riyadh",
};
const productInput = {
  name: "Latte",
  type: "PRODUCT",
  category: "Drinks",
  sellingPrice: "10.50",
  costPrice: "3.25",
  active: true,
};
const saleInput = {
  saleDate: "2026-09-20",
  productServiceId: null,
  quantity: "3",
  unitPrice: "0.1",
  unitCost: null,
  costMode: "EXPLICIT",
  note: "Counter sale",
};
async function business(currency = "SAR", actor = owner) {
  return createBusiness(db, actor, { ...businessInput, currency });
}
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@records-test.example` },
    })
  ).id;
  outsider = (
    await db.user.create({
      data: { email: `${randomUUID()}@records-test.example`, role: "ADMIN" },
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

test("new businesses get nine classified defaults without locking financial settings", async () => {
  const b = await business();
  const categories = await listRecords(
    db,
    owner,
    b.id,
    "expense-categories",
    {},
  );
  expect(categories.total).toBe(9);
  expect(
    categories.records.find((item) => item.name === "Inventory")
      ?.classification,
  ).toBe("INVENTORY_PURCHASE");
  expect(
    categories.records.find((item) => item.name === "Other")?.classification,
  ).toBe("OTHER");
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
  await expect(
    saveRecord(db, owner, b.id, "expense-categories", {
      name: " rent ",
      classification: "OTHER",
    }),
  ).rejects.toMatchObject({ code: "P2002" });
});
test("priced catalog creation locks currency/timezone, while failed validation rolls back", async () => {
  const b = await business();
  await expect(
    saveRecord(db, owner, b.id, "products", {
      ...productInput,
      sellingPrice: "-1",
    }),
  ).rejects.toThrow();
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
  await saveRecord(db, owner, b.id, "products", productInput);
  const locked = await getOwnedBusiness(db, owner, b.id);
  expect(locked.financialSettingsLockedAt).not.toBeNull();
  for (const change of [{ currency: "USD" }, { timezone: "UTC" }])
    await expect(
      updateBusiness(db, owner, b.id, {
        ...businessInput,
        ...change,
        version: locked.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
});
test("sale totals and historical snapshots survive catalog edits and archiving", async () => {
  const b = await business();
  const p = await saveRecord(db, owner, b.id, "products", productInput);
  const sale = await saveRecord(db, owner, b.id, "sales", {
    ...saleInput,
    productServiceId: p.id,
    costMode: "CATALOG",
  });
  expect(sale).toMatchObject({
    unitCost: "3.25",
    totalAmount: "0.3",
    itemName: "Latte",
    source: "MANUAL",
  });
  await saveRecord(
    db,
    owner,
    b.id,
    "products",
    {
      ...productInput,
      name: "New latte",
      costPrice: "8",
      active: false,
      version: p.version,
    },
    p.id,
  );
  expect(await getRecord(db, owner, b.id, "sales", sale.id)).toMatchObject({
    unitCost: "3.25",
    itemName: "Latte",
  });
  const edit = await saveRecord(
    db,
    owner,
    b.id,
    "sales",
    {
      ...saleInput,
      productServiceId: p.id,
      unitCost: "3.25",
      quantity: "2.5",
      version: sale.version,
    },
    sale.id,
  );
  expect(edit).toMatchObject({
    unitCost: "3.25",
    totalAmount: "0.25",
    itemName: "Latte",
  });
  await expect(
    saveRecord(db, owner, b.id, "sales", {
      ...saleInput,
      productServiceId: p.id,
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    deleteRecord(db, owner, b.id, "products", p.id, {
      version: 2,
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 422 });
});
test("missing and zero costs remain distinct; currency rounding uses 0, 2, or 3 digits", async () => {
  for (const [currency, expected] of [
    ["JPY", "1"],
    ["SAR", "1.24"],
    ["JOD", "1.235"],
  ]) {
    const b = await business(currency);
    const sale = await saveRecord(db, owner, b.id, "sales", {
      ...saleInput,
      quantity: "1",
      unitPrice: "1.235",
    });
    expect(sale.totalAmount).toBe(expected);
    expect(sale.unitCost).toBeNull();
    const zero = await saveRecord(db, owner, b.id, "sales", {
      ...saleInput,
      unitCost: "0",
    });
    expect(zero.unitCost).toBe("0");
  }
  const b = await business();
  await expect(
    saveRecord(db, owner, b.id, "sales", {
      ...saleInput,
      quantity: "999999999",
      unitPrice: "999999999999",
    }),
  ).rejects.toMatchObject({ status: 422 });
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
});
test("expense classification is historical and referenced categories cannot be deleted", async () => {
  const b = await business();
  const opts = await getRecordOptions(db, owner, b.id);
  const inventory = opts.categories.find((item) => item.name === "Inventory")!;
  const expense = await saveRecord(db, owner, b.id, "expenses", {
    expenseDate: "2026-09-20",
    categoryId: inventory.id,
    amount: "50",
  });
  expect(expense.classification).toBe("INVENTORY_PURCHASE");
  await saveRecord(
    db,
    owner,
    b.id,
    "expense-categories",
    { name: "Inventory", classification: "OPERATING", version: 1 },
    inventory.id,
  );
  const edited = await saveRecord(
    db,
    owner,
    b.id,
    "expenses",
    {
      expenseDate: "2026-09-21",
      categoryId: inventory.id,
      amount: "60",
      version: expense.version,
    },
    expense.id,
  );
  expect(edited.classification).toBe("INVENTORY_PURCHASE");
  const newExpense = await saveRecord(db, owner, b.id, "expenses", {
    expenseDate: "2026-09-21",
    categoryId: inventory.id,
    amount: "1",
  });
  expect(newExpense.classification).toBe("OPERATING");
  await expect(
    deleteRecord(db, owner, b.id, "expense-categories", inventory.id, {
      version: 2,
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    saveRecord(db, owner, b.id, "expenses", {
      expenseDate: "2026-09-20",
      categoryId: inventory.id,
      amount: "1.001",
    }),
  ).rejects.toMatchObject({ status: 422 });
});
test("customer counts require explicit edits for duplicate days and allow known zero", async () => {
  const b = await business();
  const data = { metricDate: "2026-09-20", customerCount: 0 };
  const row = await saveRecord(db, owner, b.id, "customer-metrics", data);
  await expect(
    saveRecord(db, owner, b.id, "customer-metrics", data),
  ).rejects.toMatchObject({ code: "P2002" });
  expect(
    await saveRecord(
      db,
      owner,
      b.id,
      "customer-metrics",
      { ...data, customerCount: 84, version: row.version },
      row.id,
    ),
  ).toMatchObject({ metricDate: data.metricDate, customerCount: 84 });
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
});
test("feedback is pending with unknown sentiment and cannot accept forged analysis", async () => {
  const b = await business();
  const data = { feedbackDate: "2026-09-20", feedbackText: "Friendly staff." };
  const row = await saveRecord(db, owner, b.id, "feedback", data);
  expect(row).toMatchObject({
    sentiment: "UNKNOWN",
    analysisStatus: "PENDING",
    confidence: null,
  });
  await expect(
    saveRecord(db, owner, b.id, "feedback", { ...data, sentiment: "POSITIVE" }),
  ).rejects.toThrow();
  await db.customerFeedback.update({
    where: { id: row.id },
    data: {
      sentiment: "POSITIVE",
      analysisStatus: "ANALYZED",
      aiSummary: "Old summary",
      confidence: "0.9",
    },
  });
  expect(
    await saveRecord(
      db,
      owner,
      b.id,
      "feedback",
      { ...data, feedbackText: "Slow service.", version: row.version },
      row.id,
    ),
  ).toMatchObject({
    sentiment: "UNKNOWN",
    analysisStatus: "PENDING",
    aiSummary: null,
    confidence: null,
  });
});
test("every resource rejects foreign businesses and foreign record IDs, including ADMIN", async () => {
  const b = await business();
  const otherBusiness = await business("SAR", outsider);
  const ownedSecond = await business();
  const categoryId = (await getRecordOptions(db, owner, b.id)).categories[0]!
    .id;
  const inputs: [RecordResource, unknown][] = [
    ["products", productInput],
    ["sales", saleInput],
    ["expense-categories", { name: "Custom", classification: "OTHER" }],
    ["expenses", { categoryId, expenseDate: "2026-09-20", amount: "5" }],
    ["customer-metrics", { metricDate: "2026-09-20", customerCount: 1 }],
    ["feedback", { feedbackDate: "2026-09-20", feedbackText: "Private" }],
  ];
  for (const [resource, input] of inputs) {
    const row = await saveRecord(db, owner, b.id, resource, input);
    await expect(
      listRecords(db, outsider, b.id, resource, {}),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getRecord(db, outsider, b.id, resource, row.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getRecord(db, owner, ownedSecond.id, resource, row.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      saveRecord(
        db,
        outsider,
        otherBusiness.id,
        resource,
        { version: 1 },
        row.id,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      deleteRecord(db, outsider, otherBusiness.id, resource, row.id, {
        confirmed: true,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  }
});
test("linked products/categories cannot cross businesses, even through direct database writes", async () => {
  const first = await business();
  const second = await business();
  const p = await saveRecord(db, owner, first.id, "products", productInput);
  const category = (await getRecordOptions(db, owner, first.id)).categories[0]!;
  await expect(
    saveRecord(db, owner, second.id, "sales", {
      ...saleInput,
      productServiceId: p.id,
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    saveRecord(db, owner, second.id, "expenses", {
      categoryId: category.id,
      expenseDate: "2026-09-20",
      amount: "5",
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    db.salesRecord.create({
      data: {
        businessId: second.id,
        productServiceId: p.id,
        saleDate: new Date("2026-09-20"),
        quantity: "1",
        unitPrice: "1",
        totalAmount: "1",
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  await expect(
    db.expenseRecord.create({
      data: {
        businessId: second.id,
        categoryId: category.id,
        classification: "OTHER",
        expenseDate: new Date("2026-09-20"),
        amount: "5",
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
});
test("pagination, inclusive date/product/category filters and numeric ordering are scoped", async () => {
  const b = await business();
  const p = await saveRecord(db, owner, b.id, "products", productInput);
  for (const [date, price] of [
    ["2026-09-01", "2"],
    ["2026-09-02", "10"],
    ["2026-09-03", "3"],
  ])
    await saveRecord(db, owner, b.id, "sales", {
      ...saleInput,
      saleDate: date,
      quantity: "1",
      unitPrice: price,
      productServiceId: p.id,
    });
  const result = await listRecords(db, owner, b.id, "sales", {
    from: "2026-09-01",
    to: "2026-09-03",
    productId: p.id,
    sort: "amount",
    order: "asc",
    pageSize: 1,
    page: 2,
  });
  expect(result.total).toBe(3);
  expect(result.records[0]?.totalAmount).toBe("3");
  expect(
    (
      await listRecords(db, owner, b.id, "sales", {
        from: "2026-09-02",
        to: "2026-09-02",
      })
    ).total,
  ).toBe(1);
  expect(
    (await listRecords(db, owner, b.id, "products", { category: "Unrelated" }))
      .total,
  ).toBe(0);
  expect(
    (
      await listRecords(db, owner, b.id, "products", {
        category: "Drinks",
        search: "lat",
      })
    ).total,
  ).toBe(1);
});
test("concurrent updates cannot silently overwrite; suspended actors lose access", async () => {
  const b = await business();
  const row = await saveRecord(db, owner, b.id, "products", productInput);
  const results = await Promise.allSettled(
    ["One", "Two"].map((name) =>
      saveRecord(
        db,
        owner,
        b.id,
        "products",
        { ...productInput, name, version: row.version },
        row.id,
      ),
    ),
  );
  expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((item) => item.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason.status).toBe(409);
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  try {
    await expect(
      listRecords(db, owner, b.id, "products", {}),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveRecord(db, owner, b.id, "sales", saleInput),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
});
test("confirmed business deletion removes the complete graph while preserving other businesses", async () => {
  const b = await business();
  const keep = await business();
  const p = await saveRecord(db, owner, b.id, "products", productInput);
  const category = (await getRecordOptions(db, owner, b.id)).categories[0]!;
  await saveRecord(db, owner, b.id, "sales", {
    ...saleInput,
    productServiceId: p.id,
  });
  await saveRecord(db, owner, b.id, "expenses", {
    categoryId: category.id,
    expenseDate: "2026-09-20",
    amount: "5",
  });
  await saveRecord(db, owner, b.id, "customer-metrics", {
    metricDate: "2026-09-20",
    customerCount: 2,
  });
  await saveRecord(db, owner, b.id, "feedback", {
    feedbackDate: "2026-09-20",
    feedbackText: "Good",
  });
  const current = await getOwnedBusiness(db, owner, b.id);
  await deleteBusiness(db, owner, b.id, {
    confirmationName: b.name,
    version: current.version,
  });
  for (const count of await Promise.all([
    db.productService.count({ where: { businessId: b.id } }),
    db.salesRecord.count({ where: { businessId: b.id } }),
    db.expenseCategory.count({ where: { businessId: b.id } }),
    db.expenseRecord.count({ where: { businessId: b.id } }),
    db.customerMetric.count({ where: { businessId: b.id } }),
    db.customerFeedback.count({ where: { businessId: b.id } }),
  ]))
    expect(count).toBe(0);
  expect(
    await db.business.findUnique({ where: { id: keep.id } }),
  ).not.toBeNull();
});
test("direct SQL-style financial inserts lock settings and deleting the last sale never unlocks", async () => {
  const b = await business();
  const row = await db.salesRecord.create({
    data: {
      businessId: b.id,
      saleDate: new Date("2026-09-20"),
      quantity: "1",
      unitPrice: "1",
      totalAmount: "1",
    },
  });
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).not.toBeNull();
  await expect(
    deleteRecord(db, owner, b.id, "sales", row.id, {
      version: 1,
      confirmed: false,
    }),
  ).rejects.toThrow();
  await deleteRecord(db, owner, b.id, "sales", row.id, {
    version: 1,
    confirmed: true,
  });
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).not.toBeNull();
});
