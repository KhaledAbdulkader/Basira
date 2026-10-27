import ExcelJS from "exceljs";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { createBusiness } from "../../src/lib/business/service";
import { saveRecord } from "../../src/lib/records/service";

const headers = { origin: "http://127.0.0.1:3100" };
const businessInput = {
  name: "Olive & Oak Cafe",
  businessType: "CAFE",
  currency: "SAR",
  timezone: "Asia/Riyadh",
};
const csvFile = (name: string, text: string) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});
test("review partial CSV sales, explicitly confirm, see persisted history and updated dashboard", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.request.post("/api/v1/businesses", {
    headers,
    data: businessInput,
  });
  const business = (await response.json()).business;
  await page.request.post(`/api/v1/businesses/${business.id}/products`, {
    headers,
    data: {
      name: "Latte",
      type: "PRODUCT",
      sellingPrice: "10",
      costPrice: "3",
      active: true,
    },
  });
  await page.goto("/imports");
  await expect(
    page.getByRole("heading", { name: "Imports", exact: true }),
  ).toBeVisible();
  const file = csvFile(
    "sales.csv",
    "date,item_name,quantity,unit_price,unit_cost\n2026-09-20,Latte,2,10,3\n2026-09-21, latte ,1,5,\n2026-09-21,Missing,1,5,1",
  );
  await page.getByLabel("CSV or XLSX file").setInputFiles(file);
  await page.getByRole("button", { name: "Preview file", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your import" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Import preview rows" }),
  ).toContainText("cost is unknown");
  expect(
    await db.salesRecord.count({ where: { businessId: business.id } }),
  ).toBe(0);
  await page.getByLabel("Show rows").selectOption("invalid");
  await expect(
    page.getByRole("region", { name: "Import preview rows" }),
  ).toContainText("no matching active");
  await page.getByLabel("Show rows").selectOption("all");
  await page.screenshot({
    path: testInfo.outputPath("import-preview.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Import complete: 2 imported, 1 skipped",
  );
  await page.getByRole("link", { name: "View import result" }).click();
  await expect(
    page.getByRole("heading", { name: "Import result" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "Partial import: 2 imported, 1 skipped, 3 total rows",
  );
  await expect(page.getByRole("main")).toContainText("Row 4");
  await page.reload();
  await expect(page.getByRole("main")).toContainText("no matching active");
  await page.goto("/?period=custom&from=2026-09-20&to=2026-09-21");
  await expect(page.getByRole("main")).toContainText("SAR 25.00");
  await page.goto("/imports");
  await page.getByLabel("CSV or XLSX file").setInputFiles(file);
  await page.getByRole("button", { name: "Preview file", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "already imported",
  );
  expect(
    await db.salesRecord.count({ where: { businessId: business.id } }),
  ).toBe(2);
  expect(errors).toEqual([]);
});
test("download and fill an XLSX template, reject duplicate catalog names and import valid products", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const response = await page.request.post("/api/v1/businesses", {
    headers,
    data: businessInput,
  });
  const business = (await response.json()).business;
  await page.goto("/imports");
  await page.getByLabel("Data type", { exact: true }).selectOption("PRODUCTS");
  const templateUrl = await page
    .getByRole("link", { name: "Download XLSX template" })
    .getAttribute("href");
  const download = await page.request.get(templateUrl!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain(
    "basira-products-template.xlsx",
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await download.body()).buffer);
  book.worksheets[0]!.addRows([
    ["Tea", "PRODUCT", "Drinks", "1.00", "4.00"],
    [" tea ", "PRODUCT", "Drinks", "1", "4"],
    ["Advice", "SERVICE", "", "", "25"],
  ]);
  await page.getByLabel("CSV or XLSX file").setInputFiles({
    name: "products.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  });
  await page.getByRole("button", { name: "Preview file", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Import preview rows" }),
  ).toContainText("occurs more than once");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("import-preview-dark.png"),
    fullPage: true,
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).toContainText("1 imported, 2 skipped");
  await page.getByRole("link", { name: "View imported records" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Advice" }),
  ).toContainText("SAR 25.00");
  const product = await db.productService.findFirstOrThrow({
    where: { businessId: business.id },
  });
  expect(product).toMatchObject({
    name: "Advice",
    source: "IMPORT",
    costPrice: null,
  });
});
test("import API prevents cross-business access, cross-origin uploads and stale confirmations", async ({
  page,
  account,
  playwright,
}) => {
  const b = await createBusiness(db, account.id, businessInput);
  const base = `/api/v1/businesses/${b.id}/imports`;
  const file = csvFile(
    "expenses.csv",
    "date,category,amount\n2026-09-20,Rent,10",
  );
  const multipart = { file, importType: "EXPENSES" };
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    expect((await anonymous.get(base)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  expect(
    (
      await page.request.post(base + "/preview", {
        headers: { origin: "https://evil.example" },
        multipart,
      })
    ).status(),
  ).toBe(403);
  const other = await db.user.create({
    data: { email: `${b.id}@import-outsider.example` },
  });
  try {
    const privateBusiness = await createBusiness(db, other.id, businessInput);
    expect(
      (
        await page.request.get(
          `/api/v1/businesses/${privateBusiness.id}/imports`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(
          `/api/v1/businesses/${privateBusiness.id}/imports/preview`,
          { headers, multipart },
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.get(
          `/api/v1/businesses/${privateBusiness.id}/imports/template?type=SALES&format=csv`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await db.business.deleteMany({ where: { ownerId: other.id } });
    await db.user.delete({ where: { id: other.id } });
  }
  const response = await page.request.post(base + "/preview", {
    headers,
    multipart,
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const p = await response.json();
  expect(
    (
      await page.request.post(base + "/confirm", {
        headers,
        multipart: { ...multipart, token: p.token, confirmed: "false" },
      })
    ).status(),
  ).toBe(400);
  const rent = await db.expenseCategory.findFirstOrThrow({
    where: { businessId: b.id, name: "Rent" },
  });
  await saveRecord(
    db,
    account.id,
    b.id,
    "expense-categories",
    { name: "Rent", classification: "OTHER", version: rent.version },
    rent.id,
  );
  const stale = await page.request.post(base + "/confirm", {
    headers,
    multipart: { ...multipart, token: p.token, confirmed: "true" },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).message).toContain("changed since");
  expect(await db.expenseRecord.count({ where: { businessId: b.id } })).toBe(0);
});
