import { randomUUID } from "node:crypto";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { forecastFixture } from "../helpers/forecasting";
import { businessToday, parseDate } from "../../src/lib/records/dates";
import { addDays } from "../../src/lib/dashboard/period";

const headers = { origin: "http://127.0.0.1:3100" };
test("insufficient history blocks generation, then daily forecasts persist with charts and exact values", async ({
  page,
  account,
}, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const business = await forecastFixture(db, account.id, { days: 13 });
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: business.id },
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Latest saved forecast" }),
  ).toContainText("No saved forecast for this business");
  await page.goto("/forecasts");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Forecasts", exact: true }),
  ).toBeVisible();
  await expect(main.getByRole("status")).toContainText("13 of 14");
  await expect(
    main.getByRole("button", { name: "Generate forecast" }),
  ).toBeDisabled();
  const response = await page.request.post(
    `/api/v1/businesses/${business.id}/sales`,
    {
      headers,
      data: {
        saleDate: addDays(businessToday(business.timezone), -14),
        productServiceId: null,
        quantity: "1",
        unitPrice: "10",
        unitCost: null,
        costMode: "EXPLICIT",
      },
    },
  );
  expect(response.status()).toBe(201);
  await main.getByRole("button", { name: "Review history" }).click();
  await expect(main.getByRole("status")).toContainText(
    "Enough recorded history",
  );
  await main.getByRole("button", { name: "Generate forecast" }).click();
  await expect(
    main.getByRole("heading", { name: "Saved forecast", exact: true }),
  ).toBeVisible();
  await expect(main).toContainText("SAR 70.00");
  await expect(main.locator(".recharts-wrapper")).toHaveCount(1);
  await expect(
    main
      .getByRole("region", { name: "Forecast values", exact: true })
      .getByRole("row"),
  ).toHaveCount(8);
  await main
    .getByText("View held-out actuals and predictions", { exact: true })
    .click();
  await expect(
    main.getByRole("region", { name: "Backtest values" }),
  ).toContainText("SAR 10.00");
  await page.screenshot({
    path: testInfo.outputPath("forecast-daily-light.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const savedUrl = page.url();
  await page.reload();
  await expect(
    main.getByRole("heading", { name: "Saved forecast", exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "Back to forecasts" }).click();
  await main.getByRole("button", { name: "Generate forecast" }).click();
  await expect(page).toHaveURL(savedUrl);
  expect(
    await db.forecastRun.count({ where: { businessId: business.id } }),
  ).toBe(1);
  await page.goto("/?period=7d");
  const latest = page.getByRole("region", { name: "Latest saved forecast" });
  await expect(latest).toContainText("SAR 70.00");
  await expect(latest).toContainText("independently of the dashboard filter");
  await latest.screenshot({ path: testInfo.outputPath("latest-forecast.png") });
  await latest.getByRole("link", { name: "View saved forecast" }).click();
  await expect(page).toHaveURL(savedUrl);
  expect(errors).toEqual([]);
});
test("three full monthly expense totals use daily projections and survive business switching", async ({
  page,
  account,
}, testInfo) => {
  test.setTimeout(60000);
  const business = await forecastFixture(db, account.id, {
    days: 180,
    metric: "EXPENSE",
    value: "20",
  });
  const other = await forecastFixture(db, account.id, { days: 0 });
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: business.id },
  });
  await page.goto("/forecasts");
  const main = page.getByRole("main");
  await main.getByLabel("Forecast metric").selectOption("EXPENSE");
  await main.getByLabel("Forecast horizon").selectOption("MONTHS_3");
  await main.getByRole("button", { name: "Review history" }).click();
  await expect(main.getByRole("status")).toContainText(
    "Enough recorded history",
  );
  await expect(main).toContainText("Three full calendar-month totals");
  await main.getByRole("button", { name: "Generate forecast" }).click();
  await expect(
    main.getByRole("heading", { name: "Saved forecast", exact: true }),
  ).toBeVisible();
  await expect(
    main
      .getByRole("region", { name: "Forecast values", exact: true })
      .getByRole("row"),
  ).toHaveCount(4);
  await expect(main).toContainText("All expenses");
  await expect(main).toContainText("Inventory Purchase");
  await expect(main).toContainText("90-day backtest");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("forecast-monthly-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: other.id },
  });
  await page.goto("/forecasts");
  await expect(main.getByRole("status")).toContainText("0 of 14");
  await expect(main).toContainText("No forecasts yet");
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Latest saved forecast" }),
  ).toContainText("No saved forecast for this business");
});
test("gaps require a fresh confirmation, and forecast APIs enforce origin, ownership and strict inputs", async ({
  page,
  account,
  playwright,
}) => {
  test.setTimeout(60000);
  const business = await forecastFixture(db, account.id, {
    days: 14,
    spacing: 2,
  });
  const base = `/api/v1/businesses/${business.id}/forecasts`;
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: business.id },
  });
  await page.goto("/forecasts");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("button", { name: "Generate forecast" }),
  ).toBeDisabled();
  await main
    .getByText("Review 13 dates without records", { exact: true })
    .click();
  await expect(
    main
      .getByRole("list", { name: "Dates without records" })
      .getByRole("listitem"),
  ).toHaveCount(13);
  await main.getByRole("checkbox").check();
  await db.salesRecord.updateMany({
    where: {
      businessId: business.id,
      saleDate: parseDate(addDays(businessToday(business.timezone), -1)),
    },
    data: { unitPrice: "12", totalAmount: "12" },
  });
  await main.getByRole("button", { name: "Generate forecast" }).click();
  await expect(main.getByRole("alert")).toContainText(
    "history or forecast dates changed",
  );
  expect(
    await db.forecastRun.count({ where: { businessId: business.id } }),
  ).toBe(0);
  await main.getByRole("button", { name: "Review history" }).click();
  await expect(main.getByRole("checkbox")).not.toBeChecked();
  await main.getByRole("checkbox").check();
  await main.getByRole("button", { name: "Generate forecast" }).click();
  await expect(
    main.getByRole("heading", { name: "Saved forecast", exact: true }),
  ).toBeVisible();
  await expect(main).toContainText("user-confirmed zero gaps");
  const reviewResponse = await page.request.get(base + "/eligibility");
  expect(reviewResponse.headers()["cache-control"]).toBe("no-store");
  const review = await reviewResponse.json();
  const input = {
    metricType: "REVENUE",
    horizon: "DAYS_7",
    historyHash: review.historyHash,
    confirmGaps: true,
  };
  expect(
    (
      await page.request.post(base, {
        headers: { origin: "https://evil.example" },
        data: input,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(base, {
        headers,
        data: { ...input, predictedValue: "999999" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get(
        base + "/eligibility?horizon=DAYS_7&horizon=DAYS_30",
      )
    ).status(),
  ).toBe(400);
  expect((await page.request.get(base + "?page=0")).status()).toBe(400);
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    expect((await anonymous.get(base)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  const outsider = await db.user.create({
    data: { email: `${randomUUID()}@forecast-browser.example` },
  });
  try {
    const other = await forecastFixture(db, outsider.id);
    expect(
      (
        await page.request.get(
          `/api/v1/businesses/${other.id}/forecasts/eligibility`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(`/api/v1/businesses/${other.id}/forecasts`, {
          headers,
          data: input,
        })
      ).status(),
    ).toBe(404);
    const saved = await db.forecastRun.findFirstOrThrow({
      where: { businessId: business.id },
    });
    expect(
      (
        await page.request.get(
          `/api/v1/businesses/${other.id}/forecasts/${saved.id}`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await db.business.deleteMany({ where: { ownerId: outsider.id } });
    await db.user.delete({ where: { id: outsider.id } });
  }
});
