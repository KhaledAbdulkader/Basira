import { z } from "zod";
import { dashboardQuerySchema } from "@/lib/dashboard/period";
import { recordIdSchema, recordVersionSchema } from "@/lib/validation/records";
import type { ProviderErrorCode } from "@/lib/ai/nvidia";

export const CANONICAL_REFUSAL =
  "Sorry, I can only help with questions related to your business and the business data available in this system. If you have a business-related question, go ahead.";
export const METRIC_LABELS = {
  revenue: "Revenue",
  totalExpenses: "All recorded expenses",
  operating: "Operating expenses",
  inventory: "Inventory purchases",
  other: "Other spending",
  cogs: "Known historical COGS",
  profit: "Estimated profit",
  margin: "Estimated profit margin",
  revenueGrowth: "Sales growth",
  visits: "Customer visits",
  averageSale: "Average sale value",
  costCoverage: "Cost-data coverage",
  topProducts: "Top products",
  expenseBreakdown: "Expense breakdown",
  sentiment: "Customer sentiment",
  feedbackTopics: "Feedback topics",
  forecasts: "Saved forecasts",
  alerts: "Historical alerts",
} as const;
export const METRIC_KEYS = Object.keys(METRIC_LABELS) as [
  keyof typeof METRIC_LABELS,
  ...(keyof typeof METRIC_LABELS)[],
];
export const assistantReplySchema = z
  .object({
    inScope: z.boolean(),
    answer: z.string().trim().min(1).max(4000),
    referencedMetrics: z.array(z.enum(METRIC_KEYS)).max(METRIC_KEYS.length),
    warnings: z.array(z.string().trim().min(1).max(240)).max(5),
  })
  .strict();
export type AssistantReply = z.infer<typeof assistantReplySchema>;
export function normalizeReply(input: unknown): AssistantReply {
  const result = assistantReplySchema.parse(input);
  return result.inScope
    ? { ...result, referencedMetrics: [...new Set(result.referencedMetrics)] }
    : {
        inScope: false,
        answer: CANONICAL_REFUSAL,
        referencedMetrics: [],
        warnings: [],
      };
}
export const createConversationSchema = dashboardQuerySchema;
export const messageSchema = z
  .object({
    requestId: z.uuid(),
    version: recordVersionSchema,
    message: z
      .string()
      .trim()
      .min(1, "Enter a business question.")
      .max(2000)
      .refine((s) => !s.includes("\u0000"), "Remove null characters."),
  })
  .strict();
export const retryMessageSchema = z
  .object({ version: recordVersionSchema, messageId: recordIdSchema })
  .strict();
export const deleteConversationSchema = z
  .object({
    version: recordVersionSchema,
    confirmed: z.literal(true, { error: "Confirm deletion first." }),
  })
  .strict();
export const chatPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100000)
  .default(1);
export const CHAT_LEASE_MS = 150_000;
export const CHAT_COOLDOWN_MS = 60_000;
export const MAX_MESSAGES = 100;
export const CHAT_PROMPT_VERSION = "business-assistant-v2";
export const CHAT_ERRORS: Record<ProviderErrorCode, string> = {
  CONFIGURATION:
    "The assistant is unavailable. Ask the administrator to check the NVIDIA configuration.",
  TIMEOUT:
    "NVIDIA took too long to respond. Your question is saved; retry later.",
  RATE_LIMIT: "NVIDIA's request limit was reached. Wait a minute, then retry.",
  UNAVAILABLE: "NVIDIA is unavailable. Your question is saved; retry later.",
  INVALID_RESPONSE:
    "NVIDIA returned an incomplete or invalid answer. Your question is saved; retry later.",
  REFUSED:
    "NVIDIA did not provide an answer. Try a different business question.",
};
export function chatErrorMessage(code: string | null) {
  return CHAT_ERRORS[code as ProviderErrorCode] ?? CHAT_ERRORS.UNAVAILABLE;
}

export type ConversationView = {
  id: string;
  title: string;
  periodFrom: string;
  periodTo: string;
  version: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};
export type MessageView = {
  id: string;
  sequence: number;
  role: "USER" | "ASSISTANT";
  content: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  inScope: boolean | null;
  referencedMetrics: AssistantReply["referencedMetrics"];
  warnings: string[];
  errorCode: string | null;
  retryable: boolean;
  createdAt: string;
  model: string | null;
  context: import("./context").AssistantContext | null;
};
export type ConversationDetail = {
  conversation: ConversationView;
  messages: MessageView[];
  page: number;
  pageSize: number;
  nextAllowedAt: string | null;
  hasActiveRequest: boolean;
};
