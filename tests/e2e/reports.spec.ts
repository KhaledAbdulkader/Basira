import { randomUUID } from "node:crypto";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { alertFixture } from "../helpers/alert-database";
import { createReport } from "../../src/lib/reports/service";
import { createBusiness } from "../../src/lib/business/service";
import { evaluateAlerts } from "../../src/lib/alerts/service";
const headers = { origin: "http://127.0.0.1:3100" };
test("create a custom report, download PDF, and retain saved values after records change", async ({
  page,
  account,
}, testInfo) => {
  const f = await alertFixture(db, account.id);
  await evaluateAlerts(db, account.id, f.business.id);
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: f.business.id },
  });
  await page.goto("/reports");
  await page.getByRole("link", { name: "Create report", exact: true }).click();
  await page
    .getByLabel("Report period", { exact: true })
    .selectOption("CUSTOM");
  await page.getByLabel("Start date", { exact: true }).fill(f.period.from);
  await page.getByLabel("End date", { exact: true }).fill(f.period.to);
  await page
    .getByRole("button", { name: "Create report", exact: true })
    .click();
  await expect(page).toHaveURL(/\/reports\/c[a-z0-9]+$/);
  const id = page.url().split("/").at(-1)!,
    reportArticle = page.getByRole("article", {
      name: "Saved report",
      exact: true,
    });
  await expect(
    reportArticle.getByRole("region", {
      name: "Financial performance",
      exact: true,
    }),
  ).toContainText("SAR 2.00");
  await expect(
    reportArticle.getByRole("region", {
      name: "Historical alerts",
      exact: true,
    }),
  ).toContainText("Sales drop");
  await page.screenshot({
    path: testInfo.outputPath("report-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("report-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^basira-custom-.*\.pdf$/);
  expect(await file.failure()).toBeNull();
  await file.saveAs(testInfo.outputPath("saved-report.pdf"));
  await db.salesRecord.deleteMany({ where: { businessId: f.business.id } });
  await db.business.update({
    where: { id: f.business.id },
    data: { name: "Changed after report" },
  });
  await page.reload();
  await expect(page.getByRole("main")).toContainText("Alert cafe");
  await expect(
    reportArticle.getByRole("region", {
      name: "Financial performance",
      exact: true,
    }),
  ).toContainText("SAR 70.00");
  const exported = await page.request.get(
    `/api/v1/businesses/${f.business.id}/reports/${id}/pdf`,
  );
  expect(exported.status()).toBe(200);
  expect(exported.headers()["cache-control"]).toContain("no-store");
  expect(exported.headers()["content-type"]).toBe("application/pdf");
  expect((await exported.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByRole("link", { name: "Report history", exact: true }).click();
  await page.getByLabel("Report type", { exact: true }).selectOption("CUSTOM");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Report history" }).getByRole("article"),
  ).toHaveCount(1);
});
test("weekly/monthly reports persist, AI failure retains the summary/PDF and business switching isolates history", async ({
  page,
  account,
}) => {
  const b = await createBusiness(db, account.id, {
    name: "Reports workspace",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: b.id },
  });
  await page.goto("/reports/new");
  await page
    .getByRole("button", { name: "Create report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Weekly report", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate AI executive summary", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Report actions" }),
  ).toContainText("AI summary unavailable (configuration)");
  await expect(
    page.getByRole("region", {
      name: "Recorded performance summary",
      exact: true,
    }),
  ).toContainText("not applicable without sales");
  await expect(
    page.getByRole("link", { name: "Download PDF", exact: true }),
  ).toBeVisible();
  await page.goto("/reports/new");
  await page
    .getByLabel("Report period", { exact: true })
    .selectOption("MONTHLY");
  await page
    .getByRole("button", { name: "Create report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Monthly report", exact: true }),
  ).toBeVisible();
  const before = page.url();
  const other = await createBusiness(db, account.id, {
    name: "Second workspace",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: other.id },
  });
  await page.goto("/reports");
  await expect(
    page.getByRole("region", { name: "Report history" }),
  ).toContainText("No reports match");
  await page.goto(before);
  await expect(
    page.getByRole("heading", { name: "Report not found", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main")).not.toContainText("Reports workspace");
});
test("report and PDF endpoints enforce current owner scope, strict requests, origin and idempotency", async ({
  page,
  account,
  request,
}) => {
  const f = await alertFixture(db, account.id),
    base = `/api/v1/businesses/${f.business.id}/reports`;
  const body = {
    requestId: randomUUID(),
    reportType: "CUSTOM",
    from: f.period.from,
    to: f.period.to,
  };
  expect((await request.get(base)).status()).toBe(401);
  expect(
    (
      await page.request.post(base, {
        headers: { origin: "https://untrusted.example" },
        data: body,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(base, {
        headers,
        data: { ...body, summary: "forged" },
      })
    ).status(),
  ).toBe(400);
  const response = await page.request.post(base, { headers, data: body });
  expect(response.status()).toBe(201);
  const id = (await response.json()).report.id;
  expect(
    (await page.request.post(base, { headers, data: body })).status(),
  ).toBe(200);
  expect(
    (await page.request.get(`${base}?type=ALL&type=CUSTOM`)).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(`${base}/${id}/summary`, {
        headers,
        data: { snapshot: {} },
      })
    ).status(),
  ).toBe(400);
  const outsider = await db.user.create({
    data: { email: `${randomUUID()}@report-browser.example`, role: "ADMIN" },
  });
  try {
    const foreign = await createBusiness(db, outsider.id, {
        name: "PRIVATE report",
        businessType: "CAFE",
        currency: "SAR",
        timezone: "UTC",
      }),
      created = await createReport(db, outsider.id, foreign.id, {
        requestId: randomUUID(),
        reportType: "WEEKLY",
      });
    const foreignBase = `/api/v1/businesses/${foreign.id}/reports`;
    for (const url of [
      foreignBase,
      `${foreignBase}/${created.report.id}`,
      `${foreignBase}/${created.report.id}/pdf`,
      `${base}/${created.report.id}/pdf`,
    ])
      expect((await page.request.get(url)).status()).toBe(404);
    expect((await request.get(`${base}/${id}/pdf`)).status()).toBe(401);
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    expect((await page.request.get(`${base}/${id}/pdf`)).status()).toBe(401);
    expect(
      (
        await page.request.post(`${base}/${id}/summary`, { headers, data: {} })
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
