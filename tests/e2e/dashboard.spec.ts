import { randomUUID } from "node:crypto";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { dashboardFixture, fixturePeriod } from "../helpers/dashboard";
import { createBusiness } from "../../src/lib/business/service";

const selectedPeriod = new URLSearchParams(fixturePeriod).toString();
const origin = "http://127.0.0.1:3100";

test("dashboard shows real KPIs, accessible chart values, filters and record changes", async ({
  page,
  account,
}, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { business } = await dashboardFixture(db, account.id);
  await page.goto(`/?${selectedPeriod}`);
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText("SAR 150.00");
  await expect(
    page.getByRole("region", { name: "Estimated profit", exact: true }),
  ).toContainText("SAR 100.00");
  await expect(
    page.getByRole("region", { name: "Sales growth", exact: true }),
  ).toContainText("+50.00%");
  await expect(
    page.getByRole("region", { name: "Customer visits", exact: true }),
  ).toContainText("30");
  await expect(
    page.getByRole("region", { name: "Average sale value", exact: true }),
  ).toContainText("SAR 50.00");
  const coverage = page.getByRole("region", {
    name: "Data coverage and profit calculation",
  });
  await expect(coverage).toContainText("66.67% (2 of 3 sales)");
  await expect(coverage).toContainText("Inventory purchases (SAR 60.00)");
  await expect(coverage).toContainText("Other spending (SAR 5.00)");
  await expect(
    page.getByRole("region", { name: "Customer feedback", exact: true }),
  ).toContainText("2 awaiting analysis");
  await expect(page.locator(".recharts-wrapper")).toHaveCount(5);
  await page.getByLabel("About Estimated profit", { exact: true }).click();
  await expect(
    page.getByText("Missing costs can overstate this estimate.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("About Estimated profit", { exact: true }).click();
  await page.getByText("View daily chart data", { exact: true }).click();
  const table = page.getByRole("table", {
    name: "Recorded daily amounts and customer visits",
  });
  await expect(
    table.getByRole("row").filter({ hasText: "2024-02-23" }),
  ).toContainText("Not recorded");
  await expect(
    table
      .getByRole("row")
      .filter({ hasText: "2024-02-24" })
      .getByRole("cell")
      .nth(4),
  ).toHaveText("0");
  await page.getByText("View daily chart data", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("dashboard-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("region", { name: "Financial trends", exact: true })
    .screenshot({ path: testInfo.outputPath("financial-trends.png") });
  await page.getByRole("link", { name: "Record sale", exact: true }).click();
  await page.getByRole("button", { name: "Add sale", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Sale date").fill("2024-02-28");
  await dialog.getByLabel("Quantity").fill("1");
  await dialog.getByLabel("Unit price", { exact: true }).fill("25");
  await dialog.getByLabel("Unit cost (optional)").fill("5");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("status")).toHaveText("Record saved.");
  await page.goto(`/?${selectedPeriod}`);
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText("SAR 175.00");
  await expect(
    page.getByRole("region", { name: "Estimated profit", exact: true }),
  ).toContainText("SAR 120.00");
  const api = await page.request.get(
    `/api/v1/businesses/${business.id}/dashboard?${selectedPeriod}`,
  );
  expect(api.headers()["cache-control"]).toContain("no-store");
  expect((await api.json()).current.revenue).toBe("175");
  for (const value of ["7d", "30d", "90d"]) {
    await page
      .getByRole("combobox", { name: "Period", exact: true })
      .selectOption(value);
    await page.getByRole("button", { name: "Apply period" }).click();
    await expect(page).toHaveURL(new RegExp(`period=${value}$`));
    await expect(
      page
        .getByRole("main")
        .getByText(`${Number.parseInt(value)} days, inclusive`, {
          exact: false,
        }),
    ).toBeVisible();
  }
  await page
    .getByRole("combobox", { name: "Period", exact: true })
    .selectOption("custom");
  await page.getByLabel("Start date", { exact: true }).fill("2024-02-22");
  await page.getByLabel("End date", { exact: true }).fill("2024-02-22");
  await page.getByRole("button", { name: "Apply period" }).click();
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText("SAR 100.00");
  await expect(
    page.getByRole("region", { name: "Estimated profit", exact: true }),
  ).toContainText("SAR 50.00");
  await page.goto("/?period=custom&from=2024-02-30&to=2024-03-01");
  await expect(
    page.getByRole("heading", { name: "Check your dashboard period" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reset period" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("switching businesses replaces dashboard data and shows actionable empty states", async ({
  page,
  account,
}) => {
  const { business } = await dashboardFixture(db, account.id);
  const empty = await createBusiness(db, account.id, {
    name: "Empty studio",
    businessType: "SERVICE_PROVIDER",
    currency: "USD",
    timezone: "America/New_York",
  });
  await page.goto(`/?${selectedPeriod}`);
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText("SAR 150.00");
  if ((page.viewportSize()?.width ?? 1440) < 1024)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("combobox", { name: "Active business" })
    .filter({ visible: true })
    .selectOption(empty.id);
  await expect(
    page.getByRole("heading", { name: "Empty studio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText("USD 0.00");
  await expect(
    page.getByRole("heading", { name: "No records in this period" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Sales growth", exact: true }),
  ).toContainText("Not available");
  await expect(
    page.getByRole("region", { name: "Customer visits", exact: true }),
  ).toContainText("Not recorded");
  await expect(
    page.getByRole("link", { name: "Record customer visits", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".recharts-surface")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Empty studio", exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.get(
          `/api/v1/businesses/${business.id}/dashboard?${selectedPeriod}`,
        )
      ).json()
    ).current.revenue,
  ).toBe("150");
});

test("dashboard API blocks anonymous, suspended and foreign actors and rejects invalid filters", async ({
  page,
  account,
  playwright,
}) => {
  const { business } = await dashboardFixture(db, account.id);
  const endpoint = `/api/v1/businesses/${business.id}/dashboard`;
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await anonymous.get(endpoint)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  for (const query of [
    "period=invalid",
    "period=custom",
    "period=7d&period=30d",
    "period=custom&from=2024-02-30&to=2024-03-01",
    "businessId=foreign",
    "period=custom&from=2020-01-01&to=2024-01-01",
  ])
    expect((await page.request.get(`${endpoint}?${query}`)).status()).toBe(400);
  const foreign = await db.user.create({
    data: { email: `${randomUUID()}@dashboard-e2e.example` },
  });
  try {
    const foreignBusiness = await createBusiness(db, foreign.id, {
      name: "Private cafe",
      businessType: "CAFE",
      currency: "SAR",
      timezone: "Asia/Riyadh",
    });
    await db.user.update({
      where: { id: account.id },
      data: { role: "ADMIN" },
    });
    const response = await page.request.get(
      `/api/v1/businesses/${foreignBusiness.id}/dashboard`,
    );
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("Private cafe");
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    expect((await page.request.get(endpoint)).status()).toBe(401);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await db.business.deleteMany({ where: { ownerId: foreign.id } });
    await db.user.delete({ where: { id: foreign.id } });
  }
});
