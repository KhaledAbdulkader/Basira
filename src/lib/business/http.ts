import { cookies } from "next/headers";
import { ZodError } from "zod";
import { AccessError } from "@/lib/auth/access";
import { readAuthOrigin } from "@/lib/auth/environment";
import { BusinessError } from "@/lib/business/service";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/business/constants";
import {
  privateJson,
  readLimitedText,
  RequestError,
  requireSameOrigin,
} from "@/lib/http/request";

export async function readBusinessMutation(request: Request): Promise<unknown> {
  requireSameOrigin(request, readAuthOrigin());
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new RequestError(415, "Send a JSON request.");
  return JSON.parse(await readLimitedText(request));
}

export function businessFailure(error: unknown) {
  if (
    error instanceof AccessError ||
    error instanceof BusinessError ||
    error instanceof RequestError
  )
    return privateJson({ message: error.message }, error.status);
  if (error instanceof ZodError)
    return privateJson(
      { message: error.issues[0]?.message ?? "Check the business details." },
      400,
    );
  if (error instanceof SyntaxError)
    return privateJson({ message: "Send valid JSON." }, 400);
  return privateJson(
    { message: "We couldn’t complete the business request. Please try again." },
    503,
  );
}

export async function setSelectedBusiness(id: string) {
  (await cookies()).set(SELECTED_BUSINESS_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: readAuthOrigin().startsWith("https:"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSelectedBusinessIfMatches(id: string) {
  const store = await cookies();
  if (store.get(SELECTED_BUSINESS_COOKIE)?.value === id)
    store.delete(SELECTED_BUSINESS_COOKIE);
}
