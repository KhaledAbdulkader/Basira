import { calculateMetrics } from "../../src/lib/dashboard/calculations";
import type { AlertInputs } from "../../src/lib/alerts/engine";
import {
  ALERT_TYPES,
  RULES,
  type RuleView,
} from "../../src/lib/alerts/contracts";

export const testRules: RuleView[] = ALERT_TYPES.map((type, index) => ({
  id: `c${String(index).padStart(24, "0")}`,
  type,
  enabled: true,
  threshold: RULES[type].threshold,
  version: 1,
}));
export function alertInput(): AlertInputs {
  const metrics = calculateMetrics({ sales: [], expenses: [], customers: [] });
  return {
    currency: "SAR",
    timezone: "Asia/Riyadh",
    now: new Date("2026-10-09T09:00:00Z"),
    period: { from: "2026-09-09", to: "2026-10-08", days: 30 },
    previousPeriod: { from: "2026-08-10", to: "2026-09-08", days: 30 },
    current: { ...metrics },
    previous: { ...metrics },
    sentiment: {
      positive: 0,
      neutral: 0,
      negative: 0,
      unknown: 0,
      pending: 0,
      failed: 0,
      total: 0,
    },
    forecast: null,
  };
}
