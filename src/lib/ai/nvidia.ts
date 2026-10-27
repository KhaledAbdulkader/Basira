import { z } from "zod";
import { NVIDIA_MODEL_CONFIG } from "./models";

export type ProviderErrorCode =
  | "CONFIGURATION"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "REFUSED";
export class ProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode) {
    super(code);
  }
}
const envelopeSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .length(1),
});

// Credentials are supplied exclusively by server-only wrappers; tests inject fetch.
export function createNvidiaClient(
  environment: Record<string, string | undefined>,
  transport: typeof fetch = fetch,
  purpose: keyof typeof NVIDIA_MODEL_CONFIG = "default",
) {
  const key = environment.NVIDIA_API_KEY?.trim();
  const configuration = NVIDIA_MODEL_CONFIG[purpose];
  const model =
    environment[configuration.environmentKey]?.trim() || configuration.model;
  if (
    !key ||
    !/^nvapi-[A-Za-z0-9_-]+$/.test(key) ||
    key.length > 512 ||
    model !== configuration.model
  )
    throw new ProviderError("CONFIGURATION");
  return {
    provider: "NVIDIA",
    model,
    async complete(input: {
      system: string;
      user: string;
      format: object;
      maxTokens: number;
    }): Promise<unknown> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await transport(
          "https://integrate.api.nvidia.com/v1/chat/completions",
          {
            method: "POST",
            redirect: "error",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              model,
              stream: false,
              max_tokens: input.maxTokens,
              temperature: 0.2,
              top_p: 1,
              response_format: input.format,
              chat_template_kwargs: { enable_thinking: false },
              messages: [
                { role: "system", content: input.system },
                { role: "user", content: input.user },
              ],
            }),
          },
        );
        if (!response.ok || response.status === 202) {
          void response.body?.cancel();
          throw new ProviderError(
            response.status === 429
              ? "RATE_LIMIT"
              : [400, 401, 403, 404, 422].includes(response.status)
                ? "CONFIGURATION"
                : "UNAVAILABLE",
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw new ProviderError("INVALID_RESPONSE");
        let raw = "",
          bytes = 0;
        const decoder = new TextDecoder();
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 65_536) {
              void reader.cancel();
              throw new ProviderError("INVALID_RESPONSE");
            }
            raw += decoder.decode(chunk.value, { stream: true });
          }
          raw += decoder.decode();
        } finally {
          reader.releaseLock();
        }
        const parsed = envelopeSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) throw new ProviderError("INVALID_RESPONSE");
        const choice = parsed.data.choices[0]!;
        if (choice.message.refusal || choice.finish_reason === "content_filter")
          throw new ProviderError("REFUSED");
        if (choice.finish_reason !== "stop" || !choice.message.content)
          throw new ProviderError("INVALID_RESPONSE");
        // Only an empty Gemma thought wrapper is accepted, never reasoning text.
        const content = choice.message.content.replace(
          /^\s*<\|channel>thought\s*<channel\|>\s*/,
          "",
        );
        return JSON.parse(content) as unknown;
      } catch (error) {
        if (controller.signal.aborted) throw new ProviderError("TIMEOUT");
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(
          error instanceof SyntaxError ? "INVALID_RESPONSE" : "UNAVAILABLE",
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
