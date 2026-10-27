import { z } from "zod";
import { recordIdSchema, recordVersionSchema } from "@/lib/validation/records";

export const TOPICS = [
  "price",
  "quality",
  "customer service",
  "staff",
  "delivery",
  "waiting time",
  "cleanliness",
  "availability",
  "product/service",
  "other",
] as const;
export const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
export const analysisSchema = z
  .object({
    sentiment: z.enum(SENTIMENTS),
    topic: z.enum(TOPICS),
    summary: z.string().trim().min(1).max(600),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type FeedbackAnalysis = z.infer<typeof analysisSchema>;
export const analyzeRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("PENDING") }).strict(),
  z.object({ mode: z.literal("FAILED") }).strict(),
  z
    .object({
      mode: z.literal("SINGLE"),
      recordId: recordIdSchema,
      version: recordVersionSchema,
    })
    .strict(),
]);
export const BATCH_SIZE = 3;
export const COOLDOWN_MS = 60_000;
export const LEASE_MS = 150_000;
export const PROMPT_VERSION = "feedback-v1";
export const DEFAULT_MODEL = "google/gemma-4-31b-it";
export const ERROR_MESSAGES = {
  CONFIGURATION:
    "AI analysis is unavailable. Ask the administrator to check the NVIDIA configuration.",
  TIMEOUT: "NVIDIA took too long to respond. Retry this feedback later.",
  RATE_LIMIT:
    "NVIDIA's request limit was reached. Wait a minute before retrying.",
  UNAVAILABLE: "NVIDIA could not complete this analysis. Retry later.",
  INVALID_RESPONSE:
    "NVIDIA returned an incomplete or invalid analysis. Retry this feedback.",
  REFUSED:
    "NVIDIA did not provide an analysis for this comment. Review the text before retrying.",
} as const;
export type AnalysisErrorCode = keyof typeof ERROR_MESSAGES;
export class AnalysisError extends Error {
  constructor(public readonly code: AnalysisErrorCode) {
    super(ERROR_MESSAGES[code]);
  }
}
export function analysisErrorMessage(code: string) {
  return (
    ERROR_MESSAGES[code as AnalysisErrorCode] ?? ERROR_MESSAGES.UNAVAILABLE
  );
}
export type FeedbackInsights = {
  total: number;
  analyzed: number;
  pending: number;
  failed: number;
  inProgress: number;
  nextAllowedAt: string | null;
  sentiments: {
    sentiment: (typeof SENTIMENTS)[number];
    count: number;
    percent: number | null;
  }[];
  topics: {
    topic: string;
    count: number;
    positive: number;
    negative: number;
  }[];
};
export type AnalysisBatchResult = {
  attempted: number;
  analyzed: number;
  failed: number;
  skipped: number;
  nextAllowedAt: string | null;
};
