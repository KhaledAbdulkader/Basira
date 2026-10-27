import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "vitest";
import { testDatabase as db } from "../helpers/database";
import { createBusiness } from "@/lib/business/service";
import { getDashboard } from "@/lib/dashboard/service";
import { listRecords } from "@/lib/records/service";
import { evaluateHolt } from "@/lib/forecasting/holt";
import { csv } from "../helpers/imports";

test("large history stays aggregated/paginated with exact totals and bounded local work", async () => {
  const owner = await db.user.create({
    data: { email: `${randomUUID()}@hardening-test.example` },
  });
  try {
    const business = await createBusiness(db, owner.id, {
      name: "Volume review",
      businessType: "CAFE",
      currency: "SAR",
      timezone: "UTC",
    });
    // Direct synthetic fixture inserts avoid timing 10,000 UI writes. All normal
    // constraints/triggers still run. The dedicated test DB guard is mandatory.
    for (let start = 0; start < 10000; start += 500) {
      await db.salesRecord.createMany({
        data: Array.from({ length: 500 }, (_, i) => ({
          businessId: business.id,
          saleDate: new Date(Date.UTC(2025, 0, 1 + ((start + i) % 365))),
          quantity: "1",
          unitPrice: "10",
          unitCost: "3",
          totalAmount: "10",
          itemName: "Volume item",
        })),
      });
    }
    const started = performance.now();
    const dashboard = await getDashboard(
      db,
      owner.id,
      business.id,
      { period: "custom", from: "2025-01-01", to: "2025-12-31" },
      new Date("2026-01-02T12:00Z"),
    );
    const dashboardMs = performance.now() - started;
    expect(dashboard.current.revenue).toBe("100000");
    expect(dashboard.current.cogs).toBe("30000");
    expect(dashboard.series).toHaveLength(365);
    const pageStart = performance.now();
    const records = await listRecords(db, owner.id, business.id, "sales", {
      page: 500,
      pageSize: 20,
    });
    const pageMs = performance.now() - pageStart;
    expect(records.total).toBe(10000);
    expect(records.records).toHaveLength(20);
    expect(Buffer.byteLength(JSON.stringify(dashboard))).toBeLessThan(150000);
    expect(Buffer.byteLength(JSON.stringify(records))).toBeLessThan(25000);
    const forecastStart = performance.now();
    const forecast = evaluateHolt(
      Array.from({ length: 366 }, (_, i) => String(100 + i)),
      90,
    );
    const forecastMs = performance.now() - forecastStart;
    expect(forecast.predicted).toHaveLength(90);
    const importStart = performance.now();
    const parsed = await csv(
      "date,feedback_text\n" + "2025-12-31,Good\n".repeat(1000),
      "FEEDBACK",
    );
    const importMs = performance.now() - importStart;
    expect(parsed.rows).toHaveLength(1000);
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/phase13-performance.json",
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          note: "Local isolated test database, one caller; not a production SLA or load test.",
          records: 10000,
          dashboardMs,
          pageMs,
          forecastMs,
          importMs,
          dashboardBytes: Buffer.byteLength(JSON.stringify(dashboard)),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.business.deleteMany({ where: { ownerId: owner.id } });
    await db.user.deleteMany({ where: { id: owner.id } });
    await db.$disconnect();
  }
}, 60000);
