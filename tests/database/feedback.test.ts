import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { testDatabase as db } from "../helpers/database";
import { createBusiness, getOwnedBusiness } from "@/lib/business/service";
import { deleteRecord, getRecord, saveRecord } from "@/lib/records/service";
import { analyzeFeedback, getFeedbackInsights } from "@/lib/feedback/service";
import {
  AnalysisError,
  DEFAULT_MODEL,
  PROMPT_VERSION,
  type FeedbackAnalysis,
} from "@/lib/feedback/contracts";
import type { FeedbackAnalyzer } from "@/lib/feedback/provider";

let owner: string, outsider: string;
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const initial = new Date("2026-10-08T12:00:00Z");
const analysis: FeedbackAnalysis = {
  sentiment: "POSITIVE",
  topic: "staff",
  summary: "Friendly staff.",
  confidence: 0.91456,
};
const fixtureAnalyzer = (
  analyze = vi.fn<FeedbackAnalyzer["analyze"]>().mockResolvedValue(analysis),
): FeedbackAnalyzer => ({
  provider: "NVIDIA",
  model: DEFAULT_MODEL,
  promptVersion: PROMPT_VERSION,
  analyze,
});
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@feedback-test.example` },
    })
  ).id;
  outsider = (
    await db.user.create({
      data: { email: `${randomUUID()}@feedback-test.example`, role: "ADMIN" },
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
async function fixture(count = 1) {
  const b = await createBusiness(db, owner, {
    name: "Feedback cafe",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  const rows = [];
  for (let i = 0; i < count; i++)
    rows.push(
      await saveRecord(db, owner, b.id, "feedback", {
        feedbackDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
        feedbackText: `Friendly staff ${i}`,
      }),
    );
  return { b, rows };
}
test("batches are bounded, oldest-first, preserve text, and aggregate only analyzed comments", async () => {
  const { b, rows } = await fixture(5);
  const provider = fixtureAnalyzer();
  expect(
    await analyzeFeedback(
      db,
      owner,
      b.id,
      { mode: "PENDING" },
      () => provider,
      () => initial,
    ),
  ).toMatchObject({ attempted: 3, analyzed: 3, failed: 0 });
  expect(provider.analyze).toHaveBeenCalledTimes(3);
  expect(
    await getRecord(db, owner, b.id, "feedback", rows[0]!.id),
  ).toMatchObject({
    feedbackText: "Friendly staff 0",
    sentiment: "POSITIVE",
    analysisStatus: "ANALYZED",
    analysisModel: DEFAULT_MODEL,
    confidence: "0.9146",
    version: 2,
  });
  const summary = await getFeedbackInsights(db, owner, b.id, initial);
  expect(summary).toMatchObject({
    total: 5,
    analyzed: 3,
    pending: 2,
    failed: 0,
    topics: [{ topic: "staff", count: 3, positive: 3, negative: 0 }],
  });
  expect(summary.sentiments[0]).toEqual({
    sentiment: "POSITIVE",
    count: 3,
    percent: 100,
  });
  expect(
    (await getOwnedBusiness(db, owner, b.id)).financialSettingsLockedAt,
  ).toBeNull();
  await expect(
    analyzeFeedback(
      db,
      owner,
      b.id,
      { mode: "PENDING" },
      () => provider,
      () => initial,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await analyzeFeedback(
      db,
      owner,
      b.id,
      { mode: "PENDING" },
      () => provider,
      () => new Date(initial.getTime() + 61_000),
    ),
  ).toMatchObject({ analyzed: 2 });
});
test("mixed successful/failed calls retain originals, safe errors, and allow explicit retry", async () => {
  const { b, rows } = await fixture(2);
  const provider = fixtureAnalyzer(
    vi
      .fn<FeedbackAnalyzer["analyze"]>()
      .mockResolvedValueOnce(analysis)
      .mockRejectedValueOnce(new AnalysisError("RATE_LIMIT")),
  );
  expect(
    await analyzeFeedback(
      db,
      owner,
      b.id,
      { mode: "PENDING" },
      () => provider,
      () => initial,
    ),
  ).toMatchObject({ analyzed: 1, failed: 1 });
  const failed = await getRecord(db, owner, b.id, "feedback", rows[1]!.id);
  expect(failed).toMatchObject({
    feedbackText: "Friendly staff 1",
    sentiment: "UNKNOWN",
    analysisStatus: "FAILED",
    analysisError: "RATE_LIMIT",
    aiSummary: null,
  });
  expect(
    await analyzeFeedback(
      db,
      owner,
      b.id,
      { mode: "FAILED" },
      () => fixtureAnalyzer(),
      () => new Date(initial.getTime() + 61_000),
    ),
  ).toMatchObject({ attempted: 1, analyzed: 1 });
  expect(
    await db.customerFeedback.findUnique({ where: { id: failed.id } }),
  ).toMatchObject({
    analysisAttempts: 2,
    analysisError: null,
    analysisStatus: "ANALYZED",
  });
});
test("foreign owners including admins and suspended accounts cannot inspect or invoke analysis", async () => {
  const { b } = await fixture();
  const factory = vi.fn(() => fixtureAnalyzer());
  await expect(getFeedbackInsights(db, outsider, b.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    analyzeFeedback(db, outsider, b.id, { mode: "PENDING" }, factory),
  ).rejects.toMatchObject({ status: 404 });
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  try {
    await expect(
      analyzeFeedback(db, owner, b.id, { mode: "PENDING" }, factory),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
  expect(factory).not.toHaveBeenCalled();
});
test("configuration errors roll back claims and do not consume attempts/cooldowns", async () => {
  const { b, rows } = await fixture();
  await expect(
    analyzeFeedback(db, owner, b.id, { mode: "PENDING" }, () => {
      throw new AnalysisError("CONFIGURATION");
    }),
  ).rejects.toMatchObject({ code: "CONFIGURATION" });
  expect(
    await db.customerFeedback.findUnique({ where: { id: rows[0]!.id } }),
  ).toMatchObject({
    analysisStatus: "PENDING",
    analysisAttempts: 0,
    analysisLeaseToken: null,
  });
  expect(
    (await getOwnedBusiness(db, owner, b.id)).feedbackAnalysisNextAt,
  ).toBeNull();
});
test("single-record analysis requires a current version and rejects analyzed records", async () => {
  const { b, rows } = await fixture();
  const request = { mode: "SINGLE", recordId: rows[0]!.id, version: 99 };
  await expect(
    analyzeFeedback(
      db,
      owner,
      b.id,
      request,
      () => fixtureAnalyzer(),
      () => initial,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await analyzeFeedback(
    db,
    owner,
    b.id,
    { ...request, version: 1 },
    () => fixtureAnalyzer(),
    () => initial,
  );
  await expect(
    analyzeFeedback(
      db,
      owner,
      b.id,
      { ...request, version: 2 },
      () => fixtureAnalyzer(),
      () => new Date(initial.getTime() + 61_000),
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("concurrent requests send once; editing during inference discards the obsolete response", async () => {
  const { b, rows } = await fixture();
  const started = deferred<void>(),
    release = deferred<FeedbackAnalysis>();
  const provider = fixtureAnalyzer(
    vi.fn(() => {
      started.resolve();
      return release.promise;
    }),
  );
  const running = analyzeFeedback(
    db,
    owner,
    b.id,
    { mode: "PENDING" },
    () => provider,
    () => initial,
  );
  await started.promise;
  try {
    await expect(
      analyzeFeedback(
        db,
        owner,
        b.id,
        { mode: "PENDING" },
        () => provider,
        () => new Date(initial.getTime() + 61_000),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await saveRecord(
      db,
      owner,
      b.id,
      "feedback",
      {
        version: 1,
        feedbackDate: "2026-10-01",
        feedbackText: "Changed comment",
      },
      rows[0]!.id,
    );
  } finally {
    release.resolve(analysis);
  }
  expect(await running).toMatchObject({ analyzed: 0, skipped: 1 });
  expect(
    await getRecord(db, owner, b.id, "feedback", rows[0]!.id),
  ).toMatchObject({
    analysisStatus: "PENDING",
    feedbackText: "Changed comment",
    aiSummary: null,
    analysisProvider: null,
  });
  expect(provider.analyze).toHaveBeenCalledTimes(1);
});
test("deleting during inference never resurrects feedback", async () => {
  const { b, rows } = await fixture();
  const started = deferred<void>(),
    release = deferred<FeedbackAnalysis>();
  const running = analyzeFeedback(
    db,
    owner,
    b.id,
    { mode: "PENDING" },
    () =>
      fixtureAnalyzer(
        vi.fn(() => {
          started.resolve();
          return release.promise;
        }),
      ),
    () => initial,
  );
  await started.promise;
  try {
    await deleteRecord(db, owner, b.id, "feedback", rows[0]!.id, {
      version: 1,
      confirmed: true,
    });
  } finally {
    release.resolve(analysis);
  }
  expect(await running).toMatchObject({ skipped: 1 });
  expect(await db.customerFeedback.count({ where: { businessId: b.id } })).toBe(
    0,
  );
});
test("expired leases are reclaimable and a stale worker cannot overwrite the newer result", async () => {
  const { b } = await fixture();
  const started = deferred<void>(),
    release = deferred<FeedbackAnalysis>();
  const running = analyzeFeedback(
    db,
    owner,
    b.id,
    { mode: "PENDING" },
    () =>
      fixtureAnalyzer(
        vi.fn(() => {
          started.resolve();
          return release.promise;
        }),
      ),
    () => initial,
  );
  await started.promise;
  try {
    expect(
      await analyzeFeedback(
        db,
        owner,
        b.id,
        { mode: "PENDING" },
        () => fixtureAnalyzer(),
        () => new Date(initial.getTime() + 151_000),
      ),
    ).toMatchObject({ analyzed: 1 });
  } finally {
    release.resolve({ ...analysis, sentiment: "NEGATIVE" });
  }
  expect(await running).toMatchObject({ skipped: 1 });
  expect(
    (await getFeedbackInsights(db, owner, b.id)).sentiments[0]!.count,
  ).toBe(1);
});
test("suspension during inference prevents persistence and access to the result", async () => {
  const { b, rows } = await fixture();
  const started = deferred<void>(),
    release = deferred<FeedbackAnalysis>();
  const running = analyzeFeedback(
    db,
    owner,
    b.id,
    { mode: "PENDING" },
    () =>
      fixtureAnalyzer(
        vi.fn(() => {
          started.resolve();
          return release.promise;
        }),
      ),
    () => initial,
  );
  await started.promise;
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  const check = expect(running).rejects.toMatchObject({ status: 403 });
  release.resolve(analysis);
  try {
    await check;
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
  expect(
    await getRecord(db, owner, b.id, "feedback", rows[0]!.id),
  ).toMatchObject({ analysisStatus: "PENDING", aiSummary: null });
});
test("empty aggregates have no fabricated percentages and no provider invocation", async () => {
  const { b } = await fixture(0);
  const factory = vi.fn(() => fixtureAnalyzer());
  expect(
    await analyzeFeedback(db, owner, b.id, { mode: "PENDING" }, factory),
  ).toMatchObject({ attempted: 0 });
  expect(factory).not.toHaveBeenCalled();
  expect(
    (await getFeedbackInsights(db, owner, b.id)).sentiments.every(
      (s) => s.percent === null,
    ),
  ).toBe(true);
});
test("unexpected provider errors are stored as safe codes and DB constraints reject invalid states", async () => {
  const { b, rows } = await fixture();
  await analyzeFeedback(
    db,
    owner,
    b.id,
    { mode: "PENDING" },
    () =>
      fixtureAnalyzer(
        vi.fn().mockRejectedValue(new Error("private provider detail")),
      ),
    () => initial,
  );
  expect(
    await getRecord(db, owner, b.id, "feedback", rows[0]!.id),
  ).toMatchObject({ analysisError: "UNAVAILABLE", analysisStatus: "FAILED" });
  await expect(
    db.customerFeedback.update({
      where: { id: rows[0]!.id },
      data: { analysisAttempts: -1 },
    }),
  ).rejects.toBeDefined();
  await expect(
    db.customerFeedback.update({
      where: { id: rows[0]!.id },
      data: { analysisLeaseToken: "no-expiry" },
    }),
  ).rejects.toBeDefined();
  await expect(
    db.customerFeedback.update({
      where: { id: rows[0]!.id },
      data: { analysisError: "raw-error" },
    }),
  ).rejects.toBeDefined();
});
