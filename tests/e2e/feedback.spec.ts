import { randomUUID } from "node:crypto";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { createBusiness } from "../../src/lib/business/service";
import { saveRecord } from "../../src/lib/records/service";
import { analyzeFeedback } from "../../src/lib/feedback/service";
import {
  DEFAULT_MODEL,
  PROMPT_VERSION,
} from "../../src/lib/feedback/contracts";

const headers = { origin: "http://127.0.0.1:3100" };
const input = {
  name: "Feedback studio",
  businessType: "CAFE",
  currency: "SAR",
  timezone: "Asia/Riyadh",
};

test("analysis insights, retry errors, original comments and edits work across viewport sizes", async ({
  page,
  account,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.request.post("/api/v1/businesses", {
    headers,
    data: input,
  });
  expect(response.status()).toBe(201);
  const { business } = await response.json();
  const rows = [];
  for (const text of [
    "Friendly staff",
    "Helpful staff",
    "Rude staff",
    "Inattentive staff",
  ])
    rows.push(
      await saveRecord(db, account.id, business.id, "feedback", {
        feedbackDate: "2026-10-01",
        feedbackText: text,
      }),
    );
  const analyzer = () => ({
    provider: "NVIDIA",
    model: DEFAULT_MODEL,
    promptVersion: PROMPT_VERSION,
    analyze: async (text: string) => ({
      sentiment: (["Friendly staff", "Helpful staff"].includes(text)
        ? "POSITIVE"
        : "NEGATIVE") as "POSITIVE" | "NEGATIVE",
      topic: "staff" as const,
      summary: text,
      confidence: 0.9,
    }),
  });
  await analyzeFeedback(
    db,
    account.id,
    business.id,
    { mode: "PENDING" },
    analyzer,
    () => new Date("2026-10-01T12:00:00Z"),
  );
  await analyzeFeedback(
    db,
    account.id,
    business.id,
    { mode: "PENDING" },
    analyzer,
    () => new Date("2026-10-01T12:02:00Z"),
  );
  const pending = await saveRecord(db, account.id, business.id, "feedback", {
    feedbackDate: "2026-10-02",
    feedbackText: "الخدمة ممتازة",
  });
  const failed = await saveRecord(db, account.id, business.id, "feedback", {
    feedbackDate: "2026-10-03",
    feedbackText: "Slow service",
  });
  await db.customerFeedback.update({
    where: { id: failed.id },
    data: { analysisStatus: "FAILED", analysisError: "RATE_LIMIT" },
  });
  await page.goto("/feedback");
  const panel = page.getByRole("region", { name: "Feedback insights" });
  await expect(panel).toContainText(
    "4 of 6 comments analyzed · 1 pending · 1 failed",
  );
  await expect(panel.getByText("50% of analyzed")).toHaveCount(2);
  await expect(
    panel.getByRole("heading", { name: "Repeated complaint topics" }),
  ).toBeVisible();
  await expect(panel).toContainText("NVIDIA");
  const analyzedRow = page
    .getByRole("row")
    .filter({ hasText: "Friendly staff" });
  await expect(analyzedRow).toContainText("Classification strength: 90%");
  await analyzedRow.getByText("Analysis details", { exact: true }).click();
  await expect(analyzedRow).toContainText(DEFAULT_MODEL);
  await page.screenshot({
    path: testInfo.outputPath("feedback-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("feedback-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.getByRole("button", { name: "Analyze pending feedback" }).click();
  await expect(panel.getByRole("alert")).toContainText("NVIDIA configuration");
  expect(
    await db.customerFeedback.findUnique({ where: { id: pending.id } }),
  ).toMatchObject({
    analysisStatus: "PENDING",
    analysisAttempts: 0,
    feedbackText: "الخدمة ممتازة",
  });
  const failedRow = page.getByRole("row").filter({ hasText: "Slow service" });
  await failedRow
    .getByRole("button", { name: "Retry analysis", exact: true })
    .click();
  await expect(failedRow.getByRole("alert")).toContainText(
    "NVIDIA configuration",
  );
  await page.goto("/feedback?search=Friendly");
  await expect(panel).toContainText("4 of 6 comments analyzed");
  await expect(
    page
      .getByRole("region", { name: "Customer feedback table" })
      .getByRole("row"),
  ).toHaveCount(2);
  const record = (
    await (
      await page.request.get(
        `/api/v1/businesses/${business.id}/feedback/${rows[0]!.id}`,
      )
    ).json()
  ).record;
  expect(record.analysisLeaseToken).toBeUndefined();
  expect(
    (
      await page.request.put(
        `/api/v1/businesses/${business.id}/feedback/${record.id}`,
        {
          headers,
          data: {
            version: record.version,
            feedbackDate: "2026-10-01",
            feedbackText: "Changed my feedback",
          },
        },
      )
    ).status(),
  ).toBe(200);
  await page.goto("/feedback");
  await expect(panel).toContainText("3 of 6 comments analyzed");
  await expect(
    page.getByRole("row").filter({ hasText: "Changed my feedback" }),
  ).toContainText("Pending analysis");
  expect(errors).toEqual([]);
});

test("analysis endpoints enforce ownership, origin, strict input, authentication and suspension", async ({
  page,
  account,
  request,
}) => {
  const own = await createBusiness(db, account.id, input);
  const other = await db.user.create({
    data: { email: `${randomUUID()}@feedback-browser.example` },
  });
  try {
    const foreign = await createBusiness(db, other.id, input);
    const foreignUrl = `/api/v1/businesses/${foreign.id}/feedback-analysis`;
    const url = `/api/v1/businesses/${own.id}/feedback-analysis`;
    expect((await page.request.get(foreignUrl)).status()).toBe(404);
    expect(
      (
        await page.request.post(foreignUrl, {
          headers,
          data: { mode: "PENDING" },
        })
      ).status(),
    ).toBe(404);
    expect((await request.get(url)).status()).toBe(401);
    expect(
      (
        await page.request.post(url, {
          headers: { origin: "https://untrusted.example" },
          data: { mode: "PENDING" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(url, {
          headers,
          data: { mode: "PENDING", model: "override" },
        })
      ).status(),
    ).toBe(400);
    const empty = await page.request.post(url, {
      headers,
      data: { mode: "PENDING" },
    });
    expect(empty.status()).toBe(200);
    expect(await empty.json()).toMatchObject({ attempted: 0 });
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    // Authentication revokes suspended sessions before the service is reached.
    expect((await page.request.get(url)).status()).toBe(401);
    expect(
      (
        await page.request.post(url, { headers, data: { mode: "PENDING" } })
      ).status(),
    ).toBe(401);
  } finally {
    await db.user.update({
      where: { id: account.id },
      data: { status: "ACTIVE" },
    });
    await db.business.deleteMany({ where: { ownerId: other.id } });
    await db.user.delete({ where: { id: other.id } });
  }
});
