import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { testDatabase as db } from "../helpers/database";
import { alertFixture } from "../helpers/alert-database";
import { createBusiness, updateBusiness } from "@/lib/business/service";
import {
  createReport,
  getReport,
  listReports,
  summarizeReport,
} from "@/lib/reports/service";
import { evaluateAlerts } from "@/lib/alerts/service";
import { ProviderError } from "@/lib/ai/nvidia";
import type { ReportSummarizer } from "@/lib/reports/provider";
let owner: string, other: string;
const now = new Date();
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@reports-test.example` },
    })
  ).id;
  other = (
    await db.user.create({
      data: { email: `${randomUUID()}@reports-test.example`, role: "ADMIN" },
    })
  ).id;
});
afterAll(async () => {
  await db.business.deleteMany({
    where: { ownerId: { in: [owner, other].filter(Boolean) } },
  });
  await db.user.deleteMany({
    where: { id: { in: [owner, other].filter(Boolean) } },
  });
  await db.$disconnect();
});
async function fixture() {
  const f = await alertFixture(db, owner, now);
  await evaluateAlerts(db, owner, f.business.id, {}, now);
  const request = {
    requestId: randomUUID(),
    reportType: "CUSTOM",
    from: f.period.from,
    to: f.period.to,
  };
  return {
    ...f,
    request,
    ...(await createReport(db, owner, f.business.id, request, now)),
  };
}
const mockProvider = (
  summarize: ReportSummarizer["summarize"] = async () => ({
    summary:
      "Recorded revenue decreased. Review the saved cost coverage before acting.",
  }),
): ReportSummarizer => ({
  provider: "TEST",
  model: "synthetic-test-model",
  promptVersion: "report-summary-v1",
  summarize,
});
test("snapshot stores exact approved metrics, analyzed feedback, alerts and a deterministic summary", async () => {
  const { report } = await fixture(),
    c = report.snapshot.context;
  expect(c.current).toMatchObject({
    revenue: "70",
    cogs: "60",
    operating: "8",
    inventory: "7",
    profit: "2",
    costKnown: 1,
  });
  expect(c.sentiment).toMatchObject({ negative: 3, positive: 2 });
  expect(c.recentAlerts).toHaveLength(4);
  expect(report.summary).toContain("SAR 2.00");
  expect(report.aiStatus).toBe("NOT_REQUESTED");
});
test("later business/record/alert edits leave the saved report and its comparison data unchanged", async () => {
  const f = await fixture();
  await db.business.update({
    where: { id: f.business.id },
    data: { name: "Renamed business" },
  });
  await db.salesRecord.deleteMany({ where: { businessId: f.business.id } });
  await db.customerFeedback.deleteMany({
    where: { businessId: f.business.id },
  });
  await db.alert.updateMany({
    where: { businessId: f.business.id },
    data: { status: "DISMISSED", dismissedAt: now },
  });
  const reread = await getReport(db, owner, f.business.id, f.report.id, now);
  expect(reread.snapshot).toEqual(f.report.snapshot);
  expect(reread.summary).toBe(f.report.summary);
  expect(reread.businessName).toBe("Alert cafe");
});
test("concurrent request UUID retries create once and reject changed request fields", async () => {
  const f = await alertFixture(db, owner, now),
    request = {
      requestId: randomUUID(),
      reportType: "CUSTOM",
      from: f.period.from,
      to: f.period.to,
    };
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      createReport(db, owner, f.business.id, request, now),
    ),
  );
  expect(new Set(results.map((r) => r.report.id)).size).toBe(1);
  expect(results.filter((r) => !r.alreadyGenerated)).toHaveLength(1);
  await expect(
    createReport(
      db,
      owner,
      f.business.id,
      { ...request, reportType: "WEEKLY", from: undefined, to: undefined },
      now,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("empty reports work without AI and permanently lock currency/timezone", async () => {
  const b = await createBusiness(db, owner, {
    name: "Empty report business",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  });
  const { report } = await createReport(
    db,
    owner,
    b.id,
    { requestId: randomUUID(), reportType: "MONTHLY" },
    now,
  );
  expect(report.snapshot.context.current.revenue).toBe("0");
  expect(report.summary).toContain("not applicable without sales");
  const locked = await db.business.findUniqueOrThrow({ where: { id: b.id } });
  expect(locked.financialSettingsLockedAt).not.toBeNull();
  await expect(
    updateBusiness(db, owner, b.id, {
      version: locked.version,
      name: b.name,
      businessType: "CAFE",
      currency: "USD",
      timezone: "UTC",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
test("report services independently deny foreign/admin actors, wrong nested IDs and suspension", async () => {
  const f = await fixture(),
    foreign = await createBusiness(db, other, {
      name: "Foreign report business",
      businessType: "CAFE",
      currency: "SAR",
      timezone: "UTC",
    });
  for (const run of [
    () => getReport(db, other, f.business.id, f.report.id),
    () => listReports(db, other, f.business.id),
    () =>
      createReport(db, other, f.business.id, {
        requestId: randomUUID(),
        reportType: "WEEKLY",
      }),
    () => getReport(db, owner, foreign.id, f.report.id),
    () =>
      summarizeReport(db, other, f.business.id, f.report.id, {}, () =>
        mockProvider(),
      ),
  ])
    await expect(run()).rejects.toMatchObject({ status: 404 });
  await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
  try {
    await expect(
      getReport(db, owner, f.business.id, f.report.id),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
});
test("AI uses the saved context without identity, saves once and never rewrites the fallback", async () => {
  const f = await fixture(),
    summarize = vi.fn(mockProvider().summarize);
  await db.salesRecord.deleteMany({ where: { businessId: f.business.id } });
  const done = await summarizeReport(
    db,
    owner,
    f.business.id,
    f.report.id,
    {},
    () => mockProvider(summarize),
    () => now,
  );
  expect(done.aiStatus).toBe("COMPLETED");
  expect(done.summary).toBe(f.report.summary);
  expect(done.snapshot).toEqual(f.report.snapshot);
  expect(summarize.mock.calls[0]![0].current.revenue).toBe("70");
  expect(JSON.stringify(summarize.mock.calls[0]![0])).not.toContain(owner);
  expect(JSON.stringify(summarize.mock.calls[0]![0])).not.toContain(
    f.business.name,
  );
  await summarizeReport(
    db,
    owner,
    f.business.id,
    f.report.id,
    {},
    () => mockProvider(summarize),
    () => now,
  );
  expect(summarize).toHaveBeenCalledTimes(1);
  await expect(
    db.report.update({
      where: { id: f.report.id },
      data: { aiSummary: "rewritten" },
    }),
  ).rejects.toThrow();
});
test("missing configuration and invalid AI output retain a usable report; explicit retry uses a business cooldown", async () => {
  const f = await fixture();
  const failed = await summarizeReport(
    db,
    owner,
    f.business.id,
    f.report.id,
    {},
    () => {
      throw new ProviderError("CONFIGURATION");
    },
    () => now,
  );
  expect(failed).toMatchObject({
    aiStatus: "FAILED",
    aiError: "CONFIGURATION",
    aiSummary: null,
    summary: f.report.summary,
  });
  await expect(
    summarizeReport(
      db,
      owner,
      f.business.id,
      f.report.id,
      {},
      () => mockProvider(),
      () => now,
    ),
  ).rejects.toMatchObject({ status: 429 });
  const later = new Date(now.getTime() + 61000);
  const invalid = await summarizeReport(
    db,
    owner,
    f.business.id,
    f.report.id,
    {},
    () => mockProvider(async () => ({ summary: "" })),
    () => later,
  );
  expect(invalid).toMatchObject({
    aiStatus: "FAILED",
    aiError: "INVALID_RESPONSE",
  });
  const done = await summarizeReport(
    db,
    owner,
    f.business.id,
    f.report.id,
    {},
    () => mockProvider(),
    () => new Date(now.getTime() + 122000),
  );
  expect(done.aiStatus).toBe("COMPLETED");
});
test("an expired claim can be retried and a late completion cannot replace the recovered summary", async () => {
  const f = await fixture();
  let release!: (value: { summary: string }) => void, started!: () => void;
  const called = new Promise<void>((resolve) => {
      started = resolve;
    }),
    pending = new Promise<{ summary: string }>((resolve) => {
      release = resolve;
    });
  let time = now;
  const first = summarizeReport(
    db,
    owner,
    f.business.id,
    f.report.id,
    {},
    () =>
      mockProvider(async () => {
        started();
        return pending;
      }),
    () => time,
  );
  await called;
  await expect(
    summarizeReport(
      db,
      owner,
      f.business.id,
      f.report.id,
      {},
      () => mockProvider(),
      () => time,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await getReport(db, owner, f.business.id, f.report.id, time)).summary,
  ).toBe(f.report.summary);
  time = new Date(now.getTime() + 151000);
  const recovered = await summarizeReport(
    db,
    owner,
    f.business.id,
    f.report.id,
    {},
    () =>
      mockProvider(async () => ({
        summary: "Recovered from the saved snapshot.",
      })),
    () => time,
  );
  release({ summary: "Late stale summary." });
  await first;
  expect(
    (await getReport(db, owner, f.business.id, f.report.id, time)).aiSummary,
  ).toBe(recovered.aiSummary);
});
test("suspension during inference prevents completion and keeps the original report", async () => {
  const f = await fixture();
  try {
    await expect(
      summarizeReport(
        db,
        owner,
        f.business.id,
        f.report.id,
        {},
        () =>
          mockProvider(async () => {
            await db.user.update({
              where: { id: owner },
              data: { status: "SUSPENDED" },
            });
            return { summary: "Must not save" };
          }),
        () => now,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await db.report.findUniqueOrThrow({ where: { id: f.report.id } }))
        .aiSummary,
    ).toBeNull();
  } finally {
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  }
});
test("history paginates and filters, database rejects snapshot edits, and business deletion cascades", async () => {
  const f = await fixture();
  for (let i = 0; i < 20; i++)
    await createReport(
      db,
      owner,
      f.business.id,
      { requestId: randomUUID(), reportType: "WEEKLY" },
      now,
    );
  expect(
    (await listReports(db, owner, f.business.id, {}, now)).items,
  ).toHaveLength(20);
  expect(
    (await listReports(db, owner, f.business.id, { page: 2 }, now)).items,
  ).toHaveLength(1);
  expect(
    (await listReports(db, owner, f.business.id, { type: "CUSTOM" }, now))
      .items,
  ).toHaveLength(1);
  await expect(
    db.report.update({
      where: { id: f.report.id },
      data: { summary: "tampered" },
    }),
  ).rejects.toThrow();
  await expect(
    db.report.update({
      where: { id: f.report.id },
      data: { snapshot: { schemaVersion: 1 } },
    }),
  ).rejects.toThrow();
  await expect(
    db.report.update({
      where: { id: f.report.id },
      data: { aiStatus: "COMPLETED" },
    }),
  ).rejects.toThrow();
  await db.business.delete({ where: { id: f.business.id } });
  expect(await db.report.count({ where: { businessId: f.business.id } })).toBe(
    0,
  );
});
