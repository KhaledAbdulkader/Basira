import { ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { readAuthOrigin, readAuthSecret } from "@/lib/auth/environment";
import { registerUser } from "@/lib/auth/service";
import { AuthRateLimitError } from "@/lib/auth/throttle";
import {
  privateJson,
  readLimitedText,
  RequestError,
  requireSameOrigin,
} from "@/lib/http/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request, readAuthOrigin());
    if (
      request.headers.get("content-type")?.split(";")[0]?.trim() !==
      "application/json"
    ) {
      return privateJson({ message: "Send a JSON request." }, 415);
    }
    const input: unknown = JSON.parse(await readLimitedText(request));
    await registerUser(getDatabase(), readAuthSecret(), input);
    return privateJson(
      {
        message:
          "If these details can be used, your account is ready. Try signing in with your chosen method.",
      },
      202,
    );
  } catch (error) {
    if (error instanceof RequestError)
      return privateJson({ message: error.message }, error.status);
    if (error instanceof ZodError || error instanceof SyntaxError)
      return privateJson(
        {
          message: "Check your name, email, and password (12–128 characters).",
        },
        400,
      );
    if (error instanceof AuthRateLimitError)
      return privateJson({ message: error.message }, 429);
    return privateJson(
      { message: "We couldn’t complete that request. Please try again later." },
      503,
    );
  }
}
