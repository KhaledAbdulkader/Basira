import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { createBusiness } from "../../src/lib/business/service";
import { saveRecord } from "../../src/lib/records/service";

const origin = "http://127.0.0.1:3100";
const headers = { origin };
const businessInput = {
  name: "Olive & Oak Cafe",
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
async function createWorkspace(page: Page) {
  const response = await page.request.post("/api/v1/businesses", {
    headers,
    data: businessInput,
  });
  expect(response.status()).toBe(201);
  return (await response.json()).business as { id: string };
}
async function saveForm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save record" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Record saved.");
}

test("record product, sale, expense, daily visits and feedback through accessible forms", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const business = await createWorkspace(page);
  await page.goto("/products");
  await page.getByRole("button", { name: "Add product or service" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item name").fill("Latte");
  await dialog.getByLabel("Product category (optional)").fill("Drinks");
  await dialog.getByLabel("Selling price").fill("10.50");
  await dialog.getByLabel("Unit cost (optional)").fill("3.25");
  await page.screenshot({ path: testInfo.outputPath("product-form.png") });
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Latte" }),
  ).toContainText("SAR 3.25");
  const products = await (
    await page.request.get(`/api/v1/businesses/${business.id}/products`)
  ).json();
  await page.goto("/sales");
  await page.getByRole("button", { name: "Add sale", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Sale date").fill("2026-09-20");
  await dialog
    .getByRole("combobox", { name: "Product or service", exact: true })
    .selectOption(products.records[0].id);
  await dialog.getByLabel("Quantity").fill("2.5");
  await expect(dialog.getByLabel("Calculated total")).toHaveText("SAR 26.25");
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Latte" }),
  ).toContainText("SAR 26.25");
  await page.getByRole("button", { name: "Edit sale", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Unit cost (optional)"),
  ).toHaveValue("3.25");
  await page.getByRole("dialog").getByLabel("Quantity").fill("1.5");
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Latte" }),
  ).toContainText("SAR 15.75");
  await page.screenshot({
    path: testInfo.outputPath("sales.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Expense date").fill("2026-09-20");
  await dialog
    .getByRole("combobox", { name: "Expense category", exact: true })
    .selectOption({ label: "Inventory" });
  await dialog.getByLabel("Amount", { exact: true }).fill("25.50");
  await dialog
    .getByLabel("Description (optional)")
    .fill("Coffee beans for sale");
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Coffee beans" }),
  ).toContainText("Inventory purchase");
  await page.getByRole("button", { name: "Edit expense", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("30");
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Coffee beans" }),
  ).toContainText("SAR 30.00");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("expenses-dark.png"),
    fullPage: true,
  });
  await page.goto("/customer-metrics");
  await page.getByRole("button", { name: "Add daily count" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Count date").fill("2026-09-20");
  await dialog.getByLabel("Customer visits", { exact: true }).fill("12");
  await saveForm(page);
  await page.getByRole("button", { name: "Add daily count" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Count date").fill("2026-09-20");
  await dialog.getByLabel("Customer visits", { exact: true }).fill("13");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(dialog.getByRole("alert")).toContainText("already exists");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit daily count" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Customer visits", { exact: true })
    .fill("15");
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "2026-09-20" }),
  ).toContainText("15");
  await page.goto("/feedback");
  await page.getByRole("button", { name: "Add feedback entry" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Customer feedback", { exact: true })
    .fill("Friendly staff and excellent coffee.");
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Friendly staff" }),
  ).toContainText("Pending analysis");
  await page.getByRole("button", { name: "Delete feedback entry" }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Permanently delete" }),
  ).toBeDisabled();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Delete feedback entry" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Delete feedback entry" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Permanently delete" })
    .click();
  await expect(
    page.getByRole("heading", { name: "No matching records" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("catalog archives, category management, date filters and pagination persist", async ({
  page,
}) => {
  test.setTimeout(60000);
  const b = await createWorkspace(page);
  const base = `/api/v1/businesses/${b.id}`;
  const p = (
    await (
      await page.request.post(`${base}/products`, {
        headers,
        data: productInput,
      })
    ).json()
  ).record;
  for (let day = 1; day <= 11; day++)
    expect(
      (
        await page.request.post(`${base}/sales`, {
          headers,
          data: {
            saleDate: `2026-09-${String(day).padStart(2, "0")}`,
            productServiceId: p.id,
            quantity: "1",
            unitPrice: String(day),
            unitCost: null,
            costMode: "CATALOG",
          },
        })
      ).status(),
    ).toBe(201);
  await page.goto("/sales?pageSize=10&order=asc");
  await expect(
    page
      .getByRole("region", { name: "Sales table", exact: true })
      .getByRole("row"),
  ).toHaveCount(11);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "2026-09-11" }),
  ).toBeVisible();
  await page.getByLabel("From", { exact: true }).fill("2026-09-04");
  await page.getByLabel("To", { exact: true }).fill("2026-09-04");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page
      .getByRole("region", { name: "Sales table", exact: true })
      .getByRole("row"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("row").filter({ hasText: "2026-09-04" }),
  ).toBeVisible();
  await page.goto("/products");
  await page.getByRole("button", { name: "Edit product or service" }).click();
  await page.getByRole("dialog").getByRole("checkbox").uncheck();
  await saveForm(page);
  await expect(
    page.getByRole("row").filter({ hasText: "Latte" }),
  ).toContainText("Archived");
  await page.goto("/sales");
  await page.getByRole("button", { name: "Add sale", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Product or service", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Product or service", exact: true })
      .getByRole("option", { name: "Latte", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/expense-categories");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Category name")
    .fill("Subscriptions");
  await saveForm(page);
  const row = page.getByRole("row").filter({ hasText: "Subscriptions" });
  await row.getByRole("button", { name: "Edit category" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Category name")
    .fill("Software subscriptions");
  await saveForm(page);
  await page
    .getByRole("row")
    .filter({ hasText: "Software subscriptions" })
    .getByRole("button", { name: "Delete category" })
    .click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Permanently delete" })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Software subscriptions" }),
  ).toHaveCount(0);
});

test("record APIs deny foreign data, tampering, CSRF and suspended sessions", async ({
  page,
  account,
  request,
}) => {
  const own = await createWorkspace(page);
  const stranger = await db.user.create({
    data: { email: `${randomUUID()}@browser-test.example` },
  });
  try {
    const foreign = await createBusiness(db, stranger.id, businessInput);
    const secret = await saveRecord(db, stranger.id, foreign.id, "products", {
      ...productInput,
      name: "Private item",
    });
    const ownBase = `/api/v1/businesses/${own.id}`;
    await db.user.update({
      where: { id: account.id },
      data: { role: "ADMIN" },
    });
    for (const resource of [
      "products",
      "sales",
      "expense-categories",
      "expenses",
      "customer-metrics",
      "feedback",
    ]) {
      expect(
        (
          await page.request.get(`/api/v1/businesses/${foreign.id}/${resource}`)
        ).status(),
      ).toBe(404);
      expect((await request.get(`${ownBase}/${resource}`)).status()).toBe(401);
      expect(
        (
          await page.request.post(`${ownBase}/${resource}`, { data: {} })
        ).status(),
      ).toBe(403);
    }
    expect(
      (await page.request.get(`${ownBase}/products/${secret.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await page.request.put(`${ownBase}/products/${secret.id}`, {
          headers,
          data: { ...productInput, version: 1 },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(`${ownBase}/products`, {
          headers,
          data: { ...productInput, businessId: foreign.id },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post(`${ownBase}/sales`, {
          headers,
          data: {
            saleDate: "2026-09-20",
            quantity: "1",
            unitPrice: "5",
            unitCost: null,
            productServiceId: secret.id,
            costMode: "CATALOG",
          },
        })
      ).status(),
    ).toBe(422);
    const ownProduct = (
      await (
        await page.request.post(`${ownBase}/products`, {
          headers,
          data: productInput,
        })
      ).json()
    ).record;
    await page.goto("/products");
    await page.getByRole("button", { name: "Edit product or service" }).click();
    await page.request.put(`${ownBase}/products/${ownProduct.id}`, {
      headers,
      data: { ...productInput, name: "New name", version: 1 },
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save record" })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "changed in another window",
    );
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    expect((await page.request.get(`${ownBase}/sales`)).status()).toBe(401);
  } finally {
    await db.business.deleteMany({ where: { ownerId: stranger.id } });
    await db.user.delete({ where: { id: stranger.id } });
  }
});
