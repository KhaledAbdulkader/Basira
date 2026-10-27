import { ProviderError } from "@/lib/ai/nvidia";
import { businessFailure } from "@/lib/business/http";
import { privateJson, RequestError } from "@/lib/http/request";
import { chatErrorMessage, chatPageSchema } from "./contracts";
export function assistantFailure(error: unknown) {
  if (error instanceof ProviderError)
    return privateJson({ message: chatErrorMessage(error.code) }, 503);
  return businessFailure(error);
}
export function readChatPage(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys())
    if (key !== "page" || params.getAll(key).length > 1)
      throw new RequestError(400, "Use only a single page number.");
  return chatPageSchema.parse(params.get("page") ?? 1);
}
