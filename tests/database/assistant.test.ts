import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { testDatabase as db } from "../helpers/database";
import { dashboardFixture, fixturePeriod } from "../helpers/dashboard";
import { forecastFixture } from "../helpers/forecasting";
import { createBusiness, deleteBusiness } from "@/lib/business/service";
import {
  generateForecast,
  getForecastEligibility,
} from "@/lib/forecasting/service";
import { saveRecord } from "@/lib/records/service";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  retryMessage,
  sendMessage,
} from "@/lib/assistant/service";
import { buildAssistantContext } from "@/lib/assistant/context";
import {
  CANONICAL_REFUSAL,
  CHAT_PROMPT_VERSION,
  type AssistantReply,
} from "@/lib/assistant/contracts";
import type { BusinessAssistant } from "@/lib/assistant/provider";
import { ProviderError } from "@/lib/ai/nvidia";
import { NVIDIA_ASSISTANT_MODEL, NVIDIA_MODEL } from "@/lib/ai/models";

let owner: string, outsider: string;
const now = new Date("2026-10-09T09:00:00Z");
const later = (seconds: number) => () =>
  new Date(now.getTime() + seconds * 1000);
const reply: AssistantReply = {
  inScope: true,
  answer:
    "The recorded revenue is SAR 150. Estimated profit is SAR 100, with incomplete cost data.",
  referencedMetrics: ["revenue", "profit", "costCoverage"],
  warnings: [],
};
const provider = (
  answer = vi.fn<BusinessAssistant["answer"]>().mockResolvedValue(reply),
): BusinessAssistant => ({
  provider: "NVIDIA",
  model: NVIDIA_ASSISTANT_MODEL,
  promptVersion: CHAT_PROMPT_VERSION,
  answer,
});
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@assistant-test.example` },
    })
  ).id;
  outsider = (
    await db.user.create({
      data: { email: `${randomUUID()}@assistant-test.example`, role: "ADMIN" },
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
async function fixture(withData = false) {
  const business = withData
    ? (await dashboardFixture(db, owner)).business
    : await createBusiness(db, owner, {
        name: "Private cafe",
        businessType: "CAFE",
        currency: "SAR",
        timezone: "Asia/Riyadh",
      });
  const conversation = await createConversation(
    db,
    owner,
    business.id,
    fixturePeriod,
    now,
  );
  return { business, conversation };
}
const question = (version = 1, message = "Explain my estimated profit") => ({
  version,
  message,
  requestId: randomUUID(),
});

test("context uses approved calculations and dates, strips IDs/PII/raw records, and discloses missing data", async () => {
  const { business } = await fixture(true);
  const context = await db.$transaction((tx) =>
    buildAssistantContext(
      tx,
      owner,
      business.id,
      { from: fixturePeriod.from, to: fixturePeriod.to },
      now,
    ),
  );
  expect(context.current).toMatchObject({
    revenue: "150",
    profit: "100",
    cogs: "30",
    operating: "20",
    inventory: "60",
    other: "5",
    costMissing: 1,
    visits: 30,
  });
  expect(context.previous.revenue).toBe("100");
  expect(context.comparison.revenueGrowth).toBe("50.00");
  expect(context.warnings.join(" ")).toContain("historical costs");
  const serialized = JSON.stringify(context);
  expect(serialized).not.toContain(business.id);
  expect(serialized).not.toContain(owner);
  expect(serialized).not.toContain("feedbackText");
  expect(serialized).not.toContain(business.name);
  expect(serialized).not.toContain("password");
  expect(Buffer.byteLength(serialized)).toBeLessThan(24000);
  expect(context.availability.alerts).toBe(
    "Latest five non-dismissed historical alerts, across all dates",
  );
});
test("successful turns persist both messages, warnings and provenance with immutable context snapshots", async () => {
  const { business, conversation } = await fixture(true);
  const assistant = { ...provider(), model: NVIDIA_MODEL };
  const result = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () => assistant,
    later(0),
  );
  expect(result.conversation).toMatchObject({ messageCount: 2, version: 3 });
  expect(result.messages[1]).toMatchObject({
    status: "COMPLETED",
    content: reply.answer,
    model: NVIDIA_MODEL,
    inScope: true,
  });
  expect(result.messages[1]!.warnings.join(" ")).toContain("historical costs");
  const originalContext = result.messages[1]!.context;
  await saveRecord(db, owner, business.id, "sales", {
    saleDate: fixturePeriod.from,
    quantity: "1",
    unitPrice: "25",
    unitCost: "0",
    costMode: "EXPLICIT",
    productServiceId: null,
    note: "Private note not shared",
  });
  const next = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(3, "What changed?"),
    () => ({ ...assistant, model: NVIDIA_ASSISTANT_MODEL }),
    later(61),
  );
  expect(next.messages[1]!.context).toEqual(originalContext);
  expect(next.messages[1]!.model).toBe(NVIDIA_MODEL);
  expect(next.messages[3]!.model).toBe(NVIDIA_ASSISTANT_MODEL);
  expect(next.messages[3]!.context!.current.revenue).toBe("175");
  expect(assistant.answer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      history: [
        { role: "USER", content: "Explain my estimated profit" },
        { role: "ASSISTANT", content: reply.answer },
      ],
    }),
  );
});
test("app-level canonical refusal discards the model's alternative content and references", async () => {
  const { business, conversation } = await fixture();
  const result = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(1, "Sports trivia"),
    () =>
      provider(
        vi.fn().mockResolvedValue({
          ...reply,
          inScope: false,
          answer: "Wrong off-topic content",
        }),
      ),
    later(0),
  );
  expect(result.messages[1]).toMatchObject({
    content: CANONICAL_REFUSAL,
    referencedMetrics: [],
    warnings: [],
    inScope: false,
  });
});
test("missing configuration rolls back; provider failures preserve the question and retry in place", async () => {
  const { business, conversation } = await fixture();
  await expect(
    sendMessage(
      db,
      owner,
      business.id,
      conversation.id,
      question(),
      () => {
        throw new ProviderError("CONFIGURATION");
      },
      later(0),
    ),
  ).rejects.toMatchObject({ code: "CONFIGURATION" });
  expect(
    (await getConversation(db, owner, business.id, conversation.id)).messages,
  ).toHaveLength(0);
  const failed = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () => ({
      ...provider(vi.fn().mockRejectedValue(new ProviderError("TIMEOUT"))),
      model: NVIDIA_MODEL,
    }),
    later(0),
  );
  expect(failed.messages[0]!.content).toBe("Explain my estimated profit");
  expect(failed.messages[1]).toMatchObject({
    status: "FAILED",
    errorCode: "TIMEOUT",
    content: "",
    retryable: true,
    model: NVIDIA_MODEL,
  });
  const success = await retryMessage(
    db,
    owner,
    business.id,
    conversation.id,
    { version: failed.conversation.version, messageId: failed.messages[1]!.id },
    () => provider(),
    later(61),
  );
  expect(success.messages).toHaveLength(2);
  expect(success.messages[1]).toMatchObject({
    id: failed.messages[1]!.id,
    status: "COMPLETED",
    errorCode: null,
    model: NVIDIA_ASSISTANT_MODEL,
  });
  expect(
    (
      await db.chatMessage.findUniqueOrThrow({
        where: { id: failed.messages[1]!.id },
      })
    ).attempts,
  ).toBe(2);
});
test("ownership including ADMIN is enforced for lists, messages, retries and deletion before invoking AI", async () => {
  const { business, conversation } = await fixture();
  const factory = vi.fn(() => provider());
  await Promise.all(
    [
      listConversations(db, outsider, business.id),
      getConversation(db, outsider, business.id, conversation.id),
      sendMessage(
        db,
        outsider,
        business.id,
        conversation.id,
        question(),
        factory,
      ),
      retryMessage(
        db,
        outsider,
        business.id,
        conversation.id,
        { version: 1, messageId: conversation.id },
        factory,
      ),
      deleteConversation(db, outsider, business.id, conversation.id, {
        version: 1,
        confirmed: true,
      }),
    ].map((promise) => expect(promise).rejects.toMatchObject({ status: 404 })),
  );
  expect(factory).not.toHaveBeenCalled();
  const otherBusiness = await createBusiness(db, owner, {
    name: "Another cafe",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  await expect(
    getConversation(db, owner, otherBusiness.id, conversation.id),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    db.chatConversation.create({
      data: {
        businessId: business.id,
        userId: outsider,
        periodFrom: new Date("2026-10-01"),
        periodTo: new Date("2026-10-08"),
      },
    }),
  ).rejects.toBeDefined();
});
test("duplicate submissions are idempotent; reused IDs with changed text and stale versions are rejected", async () => {
  const { business, conversation } = await fixture();
  const assistant = provider(),
    request = question();
  const first = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    request,
    () => assistant,
    later(0),
  );
  const second = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    request,
    () => assistant,
    later(0),
  );
  expect(second.messages.map((m) => m.id)).toEqual(
    first.messages.map((m) => m.id),
  );
  expect(assistant.answer).toHaveBeenCalledTimes(1);
  await expect(
    sendMessage(
      db,
      owner,
      business.id,
      conversation.id,
      { ...request, message: "Different question" },
      () => assistant,
      later(61),
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    sendMessage(
      db,
      owner,
      business.id,
      conversation.id,
      question(1),
      () => assistant,
      later(61),
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("concurrent calls and cross-conversation requests are blocked while a lease is active", async () => {
  const { business, conversation } = await fixture(),
    started = deferred<void>(),
    release = deferred<AssistantReply>();
  const assistant = provider(
    vi.fn(() => {
      started.resolve();
      return release.promise;
    }),
  );
  const running = sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () => assistant,
    later(0),
  );
  await started.promise;
  try {
    const other = await createConversation(db, owner, business.id, {}, now);
    await expect(
      sendMessage(
        db,
        owner,
        business.id,
        other.id,
        question(),
        () => assistant,
        later(61),
      ),
    ).rejects.toMatchObject({ status: 409 });
  } finally {
    release.resolve(reply);
  }
  await running;
  expect(assistant.answer).toHaveBeenCalledTimes(1);
});
test("an expired request can be retried and its late worker cannot overwrite the replacement", async () => {
  const { business, conversation } = await fixture(),
    started = deferred<void>(),
    release = deferred<AssistantReply>();
  const running = sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () =>
      provider(
        vi.fn(() => {
          started.resolve();
          return release.promise;
        }),
      ),
    later(0),
  );
  await started.promise;
  const pending = await getConversation(
    db,
    owner,
    business.id,
    conversation.id,
    1,
    later(151)(),
  );
  expect(pending.messages[1]!.retryable).toBe(true);
  try {
    await retryMessage(
      db,
      owner,
      business.id,
      conversation.id,
      {
        version: pending.conversation.version,
        messageId: pending.messages[1]!.id,
      },
      () => provider(),
      later(151),
    );
  } finally {
    release.resolve({ ...reply, answer: "Obsolete answer" });
  }
  const finished = await running;
  expect(finished.messages[1]!.content).toBe(reply.answer);
});
test("suspension during generation prevents storing the answer, then expired work is recoverable", async () => {
  const { business, conversation } = await fixture(),
    started = deferred<void>(),
    release = deferred<AssistantReply>();
  const running = sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () =>
      provider(
        vi.fn(() => {
          started.resolve();
          return release.promise;
        }),
      ),
    later(0),
  );
  await started.promise;
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  const checked = expect(running).rejects.toMatchObject({ status: 403 });
  release.resolve(reply);
  try {
    await checked;
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
  const result = await getConversation(
    db,
    owner,
    business.id,
    conversation.id,
    1,
    later(151)(),
  );
  expect(result.messages[1]).toMatchObject({
    content: "",
    status: "PENDING",
    retryable: true,
  });
});
test("deleting while AI runs cascades messages and cannot resurrect a conversation", async () => {
  const { business, conversation } = await fixture(),
    started = deferred<void>(),
    release = deferred<AssistantReply>();
  const running = sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () =>
      provider(
        vi.fn(() => {
          started.resolve();
          return release.promise;
        }),
      ),
    later(0),
  );
  await started.promise;
  const current = await getConversation(
    db,
    owner,
    business.id,
    conversation.id,
  );
  await deleteConversation(db, owner, business.id, conversation.id, {
    version: current.conversation.version,
    confirmed: true,
  });
  const checked = expect(running).rejects.toMatchObject({ status: 404 });
  release.resolve(reply);
  await checked;
  expect(
    await db.chatMessage.count({ where: { conversationId: conversation.id } }),
  ).toBe(0);
});
test("history pagination, maximum turns, invalid structure and safe diagnostics are enforced", async () => {
  const { business, conversation } = await fixture();
  const invalid = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () =>
      provider(
        vi
          .fn()
          .mockResolvedValue({ ...reply, referencedMetrics: ["fabricated"] }),
      ),
    later(0),
  );
  expect(invalid.messages[1]).toMatchObject({
    status: "FAILED",
    errorCode: "INVALID_RESPONSE",
    content: "",
  });
  await db.chatConversation.update({
    where: { id: conversation.id },
    data: { messageCount: 100 },
  });
  await expect(
    sendMessage(
      db,
      owner,
      business.id,
      conversation.id,
      question(invalid.conversation.version),
      () => provider(),
      later(61),
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    db.chatMessage.update({
      where: { id: invalid.messages[1]!.id },
      data: { leaseToken: "unpaired" },
    }),
  ).rejects.toBeDefined();
  expect(
    (await getConversation(db, owner, business.id, conversation.id, 2))
      .messages,
  ).toEqual([]);
});
test("general business questions still receive a clearly empty, nonfabricated data context", async () => {
  const { business, conversation } = await fixture();
  const assistant = provider(
    vi.fn().mockResolvedValue({
      ...reply,
      answer: "General advice: ask customers for feedback.",
      referencedMetrics: [],
    }),
  );
  const result = await sendMessage(
    db,
    owner,
    business.id,
    conversation.id,
    question(),
    () => assistant,
    later(0),
  );
  expect(result.messages[1]!.context!.current.margin).toBeNull();
  expect(result.messages[1]!.context!.current.costCoverage).toBeNull();
  expect(result.messages[1]!.warnings.join(" ")).toContain(
    "no financial records",
  );
});

test("recent forecasts keep their own dates and saved totals and cannot cross business scope", async () => {
  const own = await forecastFixture(db, owner, { now }),
    foreign = await forecastFixture(db, outsider, { now, value: "999" });
  for (const [actor, business] of [
    [owner, own],
    [outsider, foreign],
  ] as const) {
    const review = await getForecastEligibility(
      db,
      actor,
      business.id,
      {},
      now,
    );
    await generateForecast(
      db,
      actor,
      business.id,
      {
        metricType: "REVENUE",
        horizon: "DAYS_7",
        historyHash: review.historyHash,
        confirmGaps: false,
      },
      now,
    );
  }
  await saveRecord(db, owner, own.id, "sales", {
    saleDate: "2026-10-08",
    quantity: "1",
    unitPrice: "500",
    unitCost: "0",
    costMode: "EXPLICIT",
    productServiceId: null,
  });
  const context = await db.$transaction((tx) =>
    buildAssistantContext(
      tx,
      owner,
      own.id,
      { from: "2026-10-01", to: "2026-10-08" },
      now,
    ),
  );
  expect(context.current.revenue).toBe("580");
  expect(context.forecasts).toHaveLength(1);
  expect(context.forecasts[0]).toMatchObject({
    total: "70",
    from: "2026-10-10",
    to: "2026-10-16",
    trainingEnd: "2026-10-08",
    metric: "REVENUE",
    mae: "0",
  });
  expect(context.warnings.join(" ")).toContain(
    "Later record edits do not update them",
  );
  expect(JSON.stringify(context)).not.toContain(foreign.id);
});

test("message pages preserve ordered complete pairs and deleting the business removes all chat history", async () => {
  const { business, conversation } = await fixture();
  let version = 1;
  for (let i = 0; i < 11; i++) {
    const result = await sendMessage(
      db,
      owner,
      business.id,
      conversation.id,
      question(version, `Explain business term ${i}`),
      () => provider(),
      later(i * 61),
    );
    version = result.conversation.version;
  }
  const latest = await getConversation(db, owner, business.id, conversation.id);
  const older = await getConversation(
    db,
    owner,
    business.id,
    conversation.id,
    2,
  );
  expect(latest.messages.map((m) => m.sequence)).toEqual(
    Array.from({ length: 20 }, (_, i) => i + 3),
  );
  expect(older.messages.map((m) => m.sequence)).toEqual([1, 2]);
  expect(latest.messages[0]!.role).toBe("USER");
  expect(latest.messages.at(-1)!.role).toBe("ASSISTANT");
  const current = await db.business.findUniqueOrThrow({
    where: { id: business.id },
  });
  await deleteBusiness(db, owner, business.id, {
    version: current.version,
    confirmationName: current.name,
  });
  expect(
    await db.chatConversation.count({ where: { id: conversation.id } }),
  ).toBe(0);
  expect(
    await db.chatMessage.count({ where: { conversationId: conversation.id } }),
  ).toBe(0);
});
