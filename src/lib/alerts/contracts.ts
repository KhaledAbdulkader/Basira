import { z } from "zod";
import { recordIdSchema, recordVersionSchema } from "@/lib/validation/records";

export const ALERT_TYPES = [
  "SALES_DROP",
  "EXPENSE_INCREASE",
  "LOW_PROFIT_MARGIN",
  "NEGATIVE_FEEDBACK",
  "FORECAST_DROP",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
export const ALERT_WINDOW_DAYS = 30;
export const MIN_ANALYZED_FEEDBACK = 5;
export const ALERT_ENGINE_VERSION = "alerts-v1";
export const RULES = {
  SALES_DROP: {
    label: "Sales drop",
    threshold: "20",
    description:
      "Revenue falls by at least this percentage versus the preceding period.",
    min: 0.01,
    max: 100,
  },
  EXPENSE_INCREASE: {
    label: "Expense increase",
    threshold: "20",
    description:
      "All recorded expenses rise by at least this percentage, including inventory and Other spending.",
    min: 0.01,
    max: 1000,
  },
  LOW_PROFIT_MARGIN: {
    label: "Low estimated profit margin",
    threshold: "10",
    description:
      "Estimated profit margin falls below this percentage. All sales must have historical unit costs.",
    min: 0,
    max: 100,
  },
  NEGATIVE_FEEDBACK: {
    label: "Negative feedback",
    threshold: "40",
    description: `More than this percentage of analyzed comments are negative, with at least ${MIN_ANALYZED_FEEDBACK} analyzed comments.`,
    min: 0,
    max: 100,
  },
  FORECAST_DROP: {
    label: "Forecast revenue drop",
    threshold: "15",
    description:
      "A fresh saved revenue forecast's daily average falls by more than this percentage versus its saved recent daily baseline.",
    min: 0.01,
    max: 100,
  },
} as const;
export const updateRuleSchema = z
  .object({
    version: recordVersionSchema,
    enabled: z.boolean(),
    threshold: z
      .string()
      .regex(
        /^\d{1,4}(\.\d{1,2})?$/,
        "Use a percentage with at most two decimal places.",
      ),
  })
  .strict();
export const alertListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    status: z.enum(["ALL", "UNREAD", "READ", "DISMISSED"]).default("ALL"),
    type: z.enum(["ALL", ...ALERT_TYPES]).default("ALL"),
  })
  .strict();
export const updateAlertSchema = z
  .object({
    version: recordVersionSchema,
    status: z.enum(["READ", "DISMISSED"]),
  })
  .strict();
export const emptyActionSchema = z.object({}).strict();
export const alertIdSchema = recordIdSchema;
export type RuleView = {
  id: string;
  type: AlertType;
  enabled: boolean;
  threshold: string;
  version: number;
};
export type AlertEvidence = {
  engine: string;
  threshold: string;
  measuredPercent: string;
  currency: string;
  timezone: string;
  evaluatedAt: string;
  currentValue: string;
  baselineValue: string | null;
  comparisonFrom: string | null;
  comparisonTo: string | null;
  details: string[];
  limitations: string[];
  forecastId: string | null;
};
export type AlertView = {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  severity: "WARNING";
  status: "UNREAD" | "READ" | "DISMISSED";
  version: number;
  periodFrom: string;
  periodTo: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  evidence: AlertEvidence;
};
export type RuleEvaluation = {
  type: AlertType;
  state: "DISABLED" | "INSUFFICIENT_DATA" | "CLEAR" | "TRIGGERED";
  explanation: string;
  measuredPercent: string | null;
};
