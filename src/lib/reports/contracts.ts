import { z } from "zod";
import type { AssistantContext } from "@/lib/assistant/context";
import { dateSchema, recordIdSchema } from "@/lib/validation/records";

export const REPORT_VERSION = 1;
export const REPORT_PROMPT_VERSION = "report-summary-v1";
export const REPORT_LEASE_MS = 150_000;
export const REPORT_COOLDOWN_MS = 60_000;
export const reportTypeSchema = z.enum(["WEEKLY", "MONTHLY", "CUSTOM"]);
export const createReportSchema = z
  .object({
    requestId: z.uuid(),
    reportType: reportTypeSchema,
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.reportType === "CUSTOM"
        ? !value.from || !value.to
        : value.from || value.to
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose both dates for Custom only.",
        path: ["from"],
      });
  });
export const reportListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    type: z.enum(["ALL", "WEEKLY", "MONTHLY", "CUSTOM"]).default("ALL"),
  })
  .strict();
export const reportIdSchema = recordIdSchema;
export const summaryRequestSchema = z.object({}).strict();
export const reportSummarySchema = z
  .object({
    summary: z.string().trim().min(1).max(1800),
  })
  .strict();
export type ReportSnapshot = {
  schemaVersion: 1;
  businessName: string;
  reportType: z.infer<typeof reportTypeSchema>;
  context: AssistantContext;
  observations: string[];
};
export type ReportView = {
  id: string;
  reportType: z.infer<typeof reportTypeSchema>;
  from: string;
  to: string;
  createdAt: string;
  businessName: string;
  currency: string;
  timezone: string;
  summary: string;
  aiStatus: "NOT_REQUESTED" | "PENDING" | "COMPLETED" | "FAILED";
  aiSummary: string | null;
  aiError: string | null;
  aiModel: string | null;
  aiCompletedAt: string | null;
  retryable: boolean;
};
export type ReportDetail = ReportView & { snapshot: ReportSnapshot };
