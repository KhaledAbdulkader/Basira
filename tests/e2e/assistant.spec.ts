import { randomUUID } from "node:crypto";
import { authenticatedTest as test, expect } from "./fixtures";
import { testDatabase as db } from "../helpers/database";
import { createBusiness } from "../../src/lib/business/service";
import { saveRecord } from "../../src/lib/records/service";
import {
  createConversation,
  sendMessage,
} from "../../src/lib/assistant/service";
import {
  CANONICAL_REFUSAL,
  CHAT_PROMPT_VERSION,
} from "../../src/lib/assistant/contracts";
import { ProviderError } from "../../src/lib/ai/nvidia";
import { NVIDIA_ASSISTANT_MODEL } from "../../src/lib/ai/models";

const headers = { origin: "http://127.0.0.1:3100" };
const businessInput = {
  name: "Assistant cafe",
  businessType: "CAFE",
  currency: "SAR",
  timezone: "Asia/Riyadh",
};
const period = { period: "custom", from: "2024-02-22", to: "2024-02-28" };
const now = new Date("2024-03-01T12:00:00Z");
const reply = {
  inScope: true,
  answer:
    "Based on the recorded data, revenue is SAR 100 and estimated profit is SAR 70. General advice: review customer feedback before changing your offer.",
  referencedMetrics: ["revenue", "profit"] as ("revenue" | "profit")[],
  warnings: [],
};
const assistant = () => ({
  provider: "NVIDIA",
  model: NVIDIA_ASSISTANT_MODEL,
  promptVersion: CHAT_PROMPT_VERSION,
  answer: async () => reply,
});

test("create a dated conversation, retain a failed draft, inspect saved replies and confirm deletion", async ({
  page,
  account,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.request.post("/api/v1/businesses", {
    headers,
    data: businessInput,
  });
  const { business } = await response.json();
  await saveRecord(db, account.id, business.id, "sales", {
    saleDate: period.from,
    quantity: "1",
    unitPrice: "100",
    unitCost: "30",
    costMode: "EXPLICIT",
    productServiceId: null,
  });
  await page.goto("/assistant");
  await page.getByLabel("Reporting period").selectOption("custom");
  await page.getByLabel("From", { exact: true }).fill(period.from);
  await page.getByLabel("To", { exact: true }).fill(period.to);
  await page
    .getByRole("button", { name: "Start conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/assistant\/c[a-z0-9]+$/);
  await expect(
    page.getByText("NVIDIA’s hosted Nemotron 3.5 Lightning model", {
      exact: false,
    }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByLabel("Your business question").fill("Explain my profit");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "NVIDIA configuration",
  );
  await expect(page.getByLabel("Your business question")).toHaveValue(
    "Explain my profit",
  );
  expect(await db.chatMessage.count({ where: { conversationId: id } })).toBe(0);
  const saved = await sendMessage(
    db,
    account.id,
    business.id,
    id,
    { version: 1, requestId: randomUUID(), message: "Explain my profit" },
    assistant,
    () => now,
  );
  await page.reload();
  await expect(page.getByText(reply.answer, { exact: true })).toBeVisible();
  await page.getByText("View saved business data", { exact: true }).click();
  const metrics = page.getByRole("region", { name: "Saved metric comparison" });
  await expect(
    metrics.getByRole("row").filter({
      has: page.getByRole("rowheader", {
        name: "Estimated profit",
        exact: true,
      }),
    }),
  ).toContainText("SAR 70.00");
  await page.screenshot({
    path: testInfo.outputPath("assistant-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("assistant-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const refusal = await sendMessage(
    db,
    account.id,
    business.id,
    id,
    {
      version: saved.conversation.version,
      requestId: randomUUID(),
      message: "Tell me sports trivia",
    },
    () => ({
      ...assistant(),
      answer: async () => ({
        ...reply,
        inScope: false,
        answer: "Wrong model refusal",
      }),
    }),
    () => new Date(now.getTime() + 61_000),
  );
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Conversation messages" })
      .getByText(CANONICAL_REFUSAL, { exact: true }),
  ).toBeVisible();
  expect(
    await page.getByText("Wrong model refusal", { exact: true }).count(),
  ).toBe(0);
  await page.getByText("Delete conversation", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Permanently delete conversation" }),
  ).toBeDisabled();
  await page.getByLabel("I confirm permanent deletion.").check();
  await page
    .getByRole("button", { name: "Permanently delete conversation" })
    .click();
  await expect(page).toHaveURL(/\/assistant$/);
  expect(
    await db.chatMessage.count({
      where: { conversationId: refusal.conversation.id },
    }),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("failed answers support retry and business switching never reveals another conversation", async ({
  page,
  account,
}) => {
  const response = await page.request.post("/api/v1/businesses", {
    headers,
    data: businessInput,
  });
  const { business } = await response.json();
  const conversation = await createConversation(
    db,
    account.id,
    business.id,
    period,
    now,
  );
  const failed = await sendMessage(
    db,
    account.id,
    business.id,
    conversation.id,
    { version: 1, requestId: randomUUID(), message: "Explain expenses" },
    () => ({
      ...assistant(),
      answer: async () => {
        throw new ProviderError("RATE_LIMIT");
      },
    }),
    () => now,
  );
  await page.goto(`/assistant/${conversation.id}`);
  await expect(
    page.getByText("NVIDIA's request limit was reached.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry answer", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "NVIDIA configuration",
  );
  expect(
    (
      await db.chatMessage.findUniqueOrThrow({
        where: { id: failed.messages[1]!.id },
      })
    ).status,
  ).toBe("FAILED");
  const other = await createBusiness(db, account.id, {
    ...businessInput,
    name: "Other workspace",
  });
  await page.request.post("/api/v1/businesses/selection", {
    headers,
    data: { businessId: other.id },
  });
  await page.goto(`/assistant/${conversation.id}`);
  // The inherited loading boundary can stream a 200 before notFound(); no chat is rendered.
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Conversation messages" }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.get(
        `/api/v1/businesses/${other.id}/conversations/${conversation.id}`,
      )
    ).status(),
  ).toBe(404);
  await page.goto("/assistant");
  await expect(
    page.getByRole("region", { name: "Saved conversations" }),
  ).not.toContainText("Explain expenses");
});

test("chat HTTP boundaries enforce owner scope, origin, current sessions, strict bodies and pagination", async ({
  page,
  account,
  request,
}) => {
  const own = await createBusiness(db, account.id, businessInput),
    ownConversation = await createConversation(
      db,
      account.id,
      own.id,
      period,
      now,
    );
  const other = await db.user.create({
    data: { email: `${randomUUID()}@assistant-browser.example`, role: "ADMIN" },
  });
  try {
    const foreign = await createBusiness(db, other.id, businessInput),
      c = await createConversation(db, other.id, foreign.id, period, now);
    const base = `/api/v1/businesses/${own.id}/conversations`,
      url = `${base}/${ownConversation.id}`;
    expect((await request.get(base)).status()).toBe(401);
    expect(
      (
        await page.request.get(
          `/api/v1/businesses/${foreign.id}/conversations/${c.id}`,
        )
      ).status(),
    ).toBe(404);
    expect((await page.request.get(`${base}/${c.id}`)).status()).toBe(404);
    expect(
      (
        await page.request.post(`${base}/${c.id}/messages`, {
          headers,
          data: { version: 1, requestId: randomUUID(), message: "Show data" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(`${url}/messages`, {
          headers: { origin: "https://untrusted.example" },
          data: { version: 1, requestId: randomUUID(), message: "Show data" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`${url}/messages`, {
          headers,
          data: {
            version: 1,
            requestId: randomUUID(),
            message: "Show data",
            context: { revenue: 999999 },
          },
        })
      ).status(),
    ).toBe(400);
    expect((await page.request.get(`${url}?page=1&page=2`)).status()).toBe(400);
    expect(
      (
        await page.request.delete(url, {
          headers,
          data: { version: 1, confirmed: false },
        })
      ).status(),
    ).toBe(400);
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    expect((await page.request.get(url)).status()).toBe(401);
    expect(
      (
        await page.request.post(`${url}/messages`, {
          headers,
          data: { version: 1, requestId: randomUUID(), message: "Show data" },
        })
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
