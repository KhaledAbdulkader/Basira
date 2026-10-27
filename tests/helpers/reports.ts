import { emptyAssistantContext } from "./assistant";
import { deterministicSummary } from "../../src/lib/reports/summary";
import type { ReportDetail } from "../../src/lib/reports/contracts";
export function reportFixture(): ReportDetail {
  const context = emptyAssistantContext();
  const { summary, observations } = deterministicSummary(context);
  return {
    id: "c1234567890123456789012345",
    reportType: "CUSTOM",
    from: context.period.from,
    to: context.period.to,
    createdAt: context.capturedAt,
    businessName: "Basira test cafe مقهى بصيرة",
    currency: "SAR",
    timezone: "Asia/Riyadh",
    summary,
    aiStatus: "NOT_REQUESTED",
    aiSummary: null,
    aiError: null,
    aiModel: null,
    aiCompletedAt: null,
    retryable: true,
    snapshot: {
      schemaVersion: 1,
      businessName: "Basira test cafe مقهى بصيرة",
      reportType: "CUSTOM",
      context,
      observations,
    },
  };
}
