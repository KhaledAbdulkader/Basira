import { calculateMetrics } from "../../src/lib/dashboard/calculations";
import type { AssistantContext } from "../../src/lib/assistant/context";

export function emptyAssistantContext(): AssistantContext {
  const metrics = calculateMetrics({ sales: [], expenses: [], customers: [] });
  return {
    capturedAt: "2026-10-09T09:00:00.000Z",
    business: {
      type: "CAFE",
      otherType: null,
      currency: "SAR",
      timezone: "Asia/Riyadh",
    },
    period: { from: "2026-10-01", to: "2026-10-08", days: 8 },
    comparisonPeriod: { from: "2026-09-23", to: "2026-09-30", days: 8 },
    current: metrics,
    previous: metrics,
    comparison: { revenueGrowth: null, visitGrowth: null },
    topProductsByRevenue: [],
    topProductsByQuantity: [],
    expenseBreakdown: [],
    sentiment: {
      positive: 0,
      neutral: 0,
      negative: 0,
      unknown: 0,
      pending: 0,
      failed: 0,
      total: 0,
    },
    feedbackTopics: [],
    forecasts: [],
    recentAlerts: [],
    availability: {
      alerts: "Latest five non-dismissed historical alerts, across all dates",
      rawTransactions: "Not provided",
      individualFeedback: "Not provided",
      externalResearch: "Not provided",
    },
    warnings: [
      "There are no financial records in the selected period. Zero recorded totals do not prove zero activity.",
    ],
  };
}
