import { randomUUID } from "node:crypto";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { alertFixture } from "../helpers/alert-database";
import { createBusiness } from "../../src/lib/business/service";
const headers = { origin: "http://127.0.0.1:3100" };
test("dashboard notification, triggering evidence, read/dismiss actions and filters persist without duplicates", async ({
  page,
  account,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { business } = await alertFixture(db, account.id);
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: business.id },
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Recent alerts" }),
  ).toContainText("4 unread");
  await expect(
    page.getByRole("link", { name: "Alerts, 4 unread", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Alerts, 4 unread", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alerts", exact: true }),
  ).toBeVisible();
  const history = page.getByRole("region", { name: "Alert history" });
  await expect(history.getByRole("article")).toHaveCount(4);
  const sales = history.getByRole("article", {
    name: "Sales drop",
    exact: true,
  });
  await sales.getByText("View triggering data", { exact: true }).click();
  await expect(sales).toContainText("30.00%");
  await expect(sales).toContainText("confirm both periods are complete");
  await page.screenshot({
    path: testInfo.outputPath("alerts-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("alerts-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await sales
    .getByRole("button", { name: "Mark as read", exact: true })
    .click();
  await expect(sales).toContainText("warning · read");
  await expect(
    page.getByRole("link", { name: "Alerts, 3 unread", exact: true }),
  ).toBeVisible();
  await history
    .getByRole("button", { name: "Mark all as read", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Alerts, 0 unread", exact: true }),
  ).toBeVisible();
  await sales
    .getByRole("button", { name: "Dismiss alert", exact: true })
    .click();
  await expect(sales).toContainText("warning · dismissed");
  const evaluated = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/businesses/${business.id}/alerts/evaluate`),
  );
  await page
    .getByRole("button", { name: "Check alerts now", exact: true })
    .click();
  expect((await evaluated).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Check alerts now", exact: true }),
  ).toBeEnabled();
  await page.reload();
  expect(await db.alert.count({ where: { businessId: business.id } })).toBe(4);
  await page.getByLabel("Status", { exact: true }).selectOption("DISMISSED");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(history.getByRole("article")).toHaveCount(1);
  await expect(history).toContainText("Sales drop");
  expect(errors).toEqual([]);
});
test("owners change thresholds and enabled state; switching businesses clears alert history", async ({
  page,
  account,
}, testInfo) => {
  const { business } = await alertFixture(db, account.id);
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: business.id },
  });
  await page.goto(`/businesses/${business.id}`);
  await page
    .getByRole("link", { name: "Edit alert settings", exact: true })
    .click();
  const sales = page.getByRole("form", { name: "Sales drop", exact: true });
  await sales.getByLabel("Enabled", { exact: true }).uncheck();
  const save = async () => {
    const done = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" && r.url().includes("/alert-rules/"),
    );
    await sales.getByRole("button", { name: "Save rule", exact: true }).click();
    expect((await done).status()).toBe(200);
    await page.reload();
  };
  await save();
  await expect(sales.getByLabel("Enabled", { exact: true })).not.toBeChecked();
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "SALES_DROP" },
    }),
  ).toBe(0);
  await sales.getByLabel("Threshold (%)", { exact: true }).fill("35");
  await sales.getByLabel("Enabled", { exact: true }).check();
  await save();
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "SALES_DROP" },
    }),
  ).toBe(0);
  await sales.getByLabel("Threshold (%)", { exact: true }).fill("25");
  await save();
  expect(
    await db.alert.count({
      where: { businessId: business.id, type: "SALES_DROP" },
    }),
  ).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("alert-settings.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const other = await createBusiness(db, account.id, {
    name: "Other workspace",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: other.id },
  });
  await page.goto("/alerts");
  await expect(
    page.getByRole("region", { name: "Alert history" }).getByRole("article"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Alerts, 0 unread", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Current rule checks" }),
  ).toContainText("insufficient data");
});
test("alert APIs enforce owner/admin scope, CSRF, strict bodies, bounds and current sessions", async ({
  page,
  account,
  request,
}) => {
  const { business } = await alertFixture(db, account.id),
    base = `/api/v1/businesses/${business.id}`;
  const outsider = await db.user.create({
    data: { email: `${randomUUID()}@alert-browser.example`, role: "ADMIN" },
  });
  try {
    const foreign = await alertFixture(db, outsider.id);
    expect((await request.get(`${base}/alerts`)).status()).toBe(401);
    expect(
      (
        await page.request.get(
          `/api/v1/businesses/${foreign.business.id}/alerts`,
        )
      ).status(),
    ).toBe(404);
    const response = await page.request.get(`${base}/alerts`),
      data = await response.json();
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const alert = data.items[0],
      rule = data.rules.find((r: { type: string }) => r.type === "SALES_DROP");
    expect(
      (
        await page.request.patch(
          `/api/v1/businesses/${foreign.business.id}/alerts/${alert.id}`,
          { headers, data: { version: 1, status: "READ" } },
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(`${base}/alerts/evaluate`, {
          headers: { origin: "https://untrusted.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`${base}/alerts/evaluate`, {
          headers,
          data: { revenue: 999 },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.get(`${base}/alerts?status=READ&status=UNREAD`)
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch(`${base}/alerts/${alert.id}`, {
          headers,
          data: { version: 1, status: "UNREAD" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch(`${base}/alerts/${alert.id}`, {
          headers,
          data: { version: 1, status: "READ", readAt: "2026-01-01" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch(`${base}/alert-rules/${rule.id}`, {
          headers,
          data: { version: 1, enabled: true, threshold: "101" },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await page.request.patch(`${base}/alert-rules/${rule.id}`, {
          headers,
          data: { version: 1, enabled: false, threshold: "20" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch(`${base}/alert-rules/${rule.id}`, {
          headers,
          data: { version: 1, enabled: true, threshold: "20" },
        })
      ).status(),
    ).toBe(409);
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    expect((await page.request.get(`${base}/alerts/summary`)).status()).toBe(
      401,
    );
    expect(
      (
        await page.request.post(`${base}/alerts/read-all`, {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(401);
  } finally {
    await db.user.update({
      where: { id: account.id },
      data: { status: "ACTIVE" },
    });
    await db.business.deleteMany({ where: { ownerId: outsider.id } });
    await db.user.delete({ where: { id: outsider.id } });
  }
});
