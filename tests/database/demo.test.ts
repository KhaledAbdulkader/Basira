import { randomUUID } from "node:crypto";
import { expect, test, afterAll } from "vitest";
import { testDatabase as db } from "../helpers/database";
import { DEMO_EMAIL, DEMO_USER_ID } from "../../scripts/demo/data";
import { seedDemo } from "../../scripts/demo/seed";
import { verifyPassword } from "@/lib/auth/password";
import { getDashboard } from "@/lib/dashboard/service";
import { Decimal } from "@/lib/records/money";
import {
  getForecastEligibility,
  generateForecast,
} from "@/lib/forecasting/service";
import { createReport } from "@/lib/reports/service";
import { evaluateAlerts } from "@/lib/alerts/service";

afterAll(() => db.$disconnect());
test("seed preserves an existing account with the reserved email", async () => {
  const user = await db.user.create({
    data: { email: DEMO_EMAIL, name: "Existing account" },
  });
  try {
    await expect(
      seedDemo(db, "Synthetic demo passphrase!", "2026-10-10"),
    ).rejects.toThrow("already in use");
    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({
      name: "Existing account",
      passwordHash: null,
      role: "USER",
    });
    expect(await db.business.count({ where: { ownerId: user.id } })).toBe(0);
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
});
test("demo is idempotent, preserves edits and supports exact metrics, forecasts, alerts and reports", async () => {
  const now = new Date("2026-10-11T12:00:00Z");
  let created = false;
  try {
    // Never take ownership of leftovers from a separate invocation.
    expect(
      await db.user.count({
        where: { OR: [{ email: DEMO_EMAIL }, { id: DEMO_USER_ID }] },
      }),
    ).toBe(0);
    const result = await seedDemo(
      db,
      "Synthetic demo passphrase!",
      "2026-10-10",
    );
    created = result.created;
    expect(created).toBe(true);
    expect(result.businesses).toHaveLength(2);
    const cafe = result.businesses.find((row) => row.name.includes("Cafe"))!;
    const studio = result.businesses.find((row) =>
      row.name.includes("Studio"),
    )!;
    const count = await db.salesRecord.count({
      where: { businessId: cafe.id },
    });
    expect(count).toBeGreaterThan(7000);
    const owner = await db.user.findUniqueOrThrow({
      where: { id: DEMO_USER_ID },
    });
    expect(owner.role).toBe("USER");
    expect(
      await verifyPassword("Synthetic demo passphrase!", owner.passwordHash),
    ).toBe(true);
    await db.business.update({
      where: { id: cafe.id },
      data: { name: "Preserved demo edit" },
    });
    expect(
      (await seedDemo(db, "Different password on retry!", "2026-10-11"))
        .created,
    ).toBe(false);
    expect(await db.salesRecord.count({ where: { businessId: cafe.id } })).toBe(
      count,
    );
    expect(
      await db.business.findUnique({ where: { id: cafe.id } }),
    ).toMatchObject({
      name: "Preserved demo edit",
      financialSettingsLockedAt: expect.any(Date),
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: DEMO_USER_ID } }))
        .passwordHash,
    ).toBe(owner.passwordHash);
    const dashboard = await getDashboard(
      db,
      DEMO_USER_ID,
      cafe.id,
      { period: "30d" },
      now,
    );
    expect(new Decimal(dashboard.current.inventory).gt(0)).toBe(true);
    expect(dashboard.current.profit).toBe(
      new Decimal(dashboard.current.revenue)
        .minus(dashboard.current.cogs)
        .minus(dashboard.current.operating)
        .toString(),
    );
    expect(dashboard.current.costKnown).toBeLessThan(
      dashboard.current.transactions,
    );
    expect(
      await db.customerFeedback.count({
        where: { businessId: cafe.id, analysisStatus: "ANALYZED" },
      }),
    ).toBe(0);
    for (const horizon of ["DAYS_7", "DAYS_30", "MONTHS_3"] as const) {
      const review = await getForecastEligibility(
        db,
        DEMO_USER_ID,
        cafe.id,
        { horizon, metricType: "REVENUE" },
        now,
      );
      expect(review).toMatchObject({
        eligible: true,
        gapDays: 0,
        recordedDays: 210,
      });
      const run = await generateForecast(
        db,
        DEMO_USER_ID,
        cafe.id,
        {
          horizon,
          metricType: "REVENUE",
          historyHash: review.historyHash,
          confirmGaps: false,
        },
        now,
      );
      expect(run.item.id).toBeTruthy();
    }
    expect(
      await getForecastEligibility(
        db,
        DEMO_USER_ID,
        studio.id,
        { horizon: "MONTHS_3" },
        now,
      ),
    ).toMatchObject({ eligible: false });
    await evaluateAlerts(db, DEMO_USER_ID, cafe.id, {}, now);
    const alerts = await db.alert.findMany({ where: { businessId: cafe.id } });
    expect(alerts.map((row) => row.type)).toContain("SALES_DROP");
    await evaluateAlerts(db, DEMO_USER_ID, cafe.id, {}, now);
    expect(await db.alert.count({ where: { businessId: cafe.id } })).toBe(
      alerts.length,
    );
    const report = await createReport(
      db,
      DEMO_USER_ID,
      cafe.id,
      {
        requestId: randomUUID(),
        reportType: "CUSTOM",
        from: "2026-09-11",
        to: "2026-10-10",
      },
      now,
    );
    expect(report.report.aiStatus).toBe("NOT_REQUESTED");
    expect(report.report.snapshot.context.current.revenue).toBeTruthy();
  } finally {
    if (created) {
      await db.business.deleteMany({ where: { ownerId: DEMO_USER_ID } });
      await db.user.delete({ where: { id: DEMO_USER_ID } });
    }
  }
}, 60000);
