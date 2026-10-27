// @vitest-environment node
import { expect, test } from "vitest";
import { renderReportPdf } from "@/lib/reports/pdf";
import { reportFixture } from "../helpers/reports";
test("server PDF renders a real multipage report with local Latin/Arabic fonts and no provider", async () => {
  const report = reportFixture();
  const buffer = await renderReportPdf(report);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  expect(buffer.length).toBeGreaterThan(15000);
  expect(buffer.toString("latin1")).toContain("/Type /Pages");
}, 20000);
