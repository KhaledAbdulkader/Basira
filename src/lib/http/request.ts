export class RequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readLimitedText(request: Request, maxBytes = 8192) {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new RequestError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        throw new RequestError(413, "Request is too large.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    // Cancellation can reject after a client disconnects. Keep it from hiding
    // the original failure or becoming an unhandled rejection.
    void reader.cancel().catch(() => {});
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "Send a complete UTF-8 request.");
  } finally {
    reader.releaseLock();
  }
}

// Reject ambiguous query strings before schemas validate values/unknown keys.
// fromEntries preserves own keys such as __proto__ for strict schema rejection.
export function readQuery(request: Request, allowed?: readonly string[]) {
  const params = new URL(request.url).searchParams;
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key) || (allowed && !allowed.includes(key)))
      throw new RequestError(400, "Use each supported filter once.");
    seen.add(key);
  }
  return Object.fromEntries(params);
}

export function requireSameOrigin(request: Request, origin: string) {
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new RequestError(403, "Request could not be accepted.");
  }
}

export function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
