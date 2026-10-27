import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { dashboardFixture, fixturePeriod } from "../helpers/dashboard";

const origin = "http://127.0.0.1:3100";
async function accessible(page: Page, testInfo: TestInfo, name: string) {
  // Next streams a loading shell before the page and may redirect from it.
  // Scan the settled page; a modal intentionally hides the background heading.
  await expect(
    page.getByRole("status", { name: "Loading page", exact: true }),
  ).toHaveCount(0);
  if (!(await page.getByRole("dialog").count()))
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ])
    .analyze();
  await testInfo.attach(name, {
    body: JSON.stringify(
      { violations: result.violations, incomplete: result.incomplete },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect
    .soft(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          message: n.failureSummary,
        })),
      })),
      name,
    )
    .toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    name,
  ).toBe(true);
}

test("public forms pass accessibility scans in both themes", async ({
  browser,
}, info) => {
  test.setTimeout(90000);
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    deviceScaleFactor: info.project.use.deviceScaleFactor,
  });
  const page = await context.newPage();
  try {
    for (const route of ["/login", "/register"]) {
      await page.goto(origin + route);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => {
          localStorage.setItem("basira-theme", value);
        }, theme);
        await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
        await page.reload();
        await accessible(page, info, `${route.slice(1)}-${theme}`);
      }
    }
  } finally {
    await context.close();
  }
});

test("workspace pages and record dialogs pass accessibility and responsive checks", async ({
  page,
  account,
}, info) => {
  test.setTimeout(180000);
  const { business } = await dashboardFixture(db, account.id);
  await page.request.post("/api/v1/businesses/selection", {
    headers: { origin },
    data: { businessId: business.id },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  for (const route of [
    "/?" + new URLSearchParams(fixturePeriod),
    "/sales",
    "/expenses",
    "/products",
    "/expense-categories",
    "/customer-metrics",
    "/feedback",
    "/imports",
    "/forecasts",
    "/assistant",
    "/alerts",
    "/reports",
    "/reports/new",
    "/businesses",
    "/settings",
  ]) {
    await page.goto(route);
    await accessible(page, info, `workspace-${route}`);
  }
  await page.goto("/sales");
  const trigger = page.getByRole("button", { name: "Add sale", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await accessible(page, info, "sale-dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  for (const route of [
    "/?" + new URLSearchParams(fixturePeriod),
    "/imports",
    "/feedback",
    "/reports/new",
  ]) {
    await page.goto(route);
    await accessible(page, info, `dark-${route}`);
  }
  await db.user.update({ where: { id: account.id }, data: { role: "ADMIN" } });
  for (const route of ["/admin", "/admin/users", "/admin/businesses"]) {
    await page.goto(route);
    await accessible(page, info, route);
  }
  await page.screenshot({
    path: info.outputPath("admin-accessibility-dark.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("malformed requests and ambiguous filters fail safely without modifying records", async ({
  page,
  account,
}) => {
  const { business } = await dashboardFixture(db, account.id);
  const base = `/api/v1/businesses/${business.id}`;
  const count = await db.salesRecord.count({
    where: { businessId: business.id },
  });
  for (const path of [
    "/sales?page=1&page=2",
    "/imports?page=1&page=2",
    "/imports?ownerId=other",
    "/imports/template?type=SALES&type=EXPENSES&format=csv",
    "/imports/template?type=SALES&format=csv&ownerId=other",
    "/reports?unsupported=ignored",
  ]) {
    const response = await page.request.get(base + path);
    expect(response.status(), path).toBe(400);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toMatch(
      /Prisma|stack|DATABASE_URL|postgresql:/,
    );
  }
  await db.user.update({ where: { id: account.id }, data: { role: "ADMIN" } });
  expect(
    (
      await page.request.get("/api/v1/admin/users?unsupported=ignored")
    ).status(),
  ).toBe(400);
  for (const body of [
    Buffer.from('{"bad":'),
    Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
  ]) {
    const response = await page.request.post(base + "/sales", {
      headers: { origin, "content-type": "application/json" },
      data: body,
    });
    expect(response.status()).toBe(400);
  }
  expect(
    await db.salesRecord.count({ where: { businessId: business.id } }),
  ).toBe(count);
});
