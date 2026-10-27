import { ZodError } from "zod";
import { AccessError } from "@/lib/auth/access";
import { privateJson, RequestError } from "@/lib/http/request";
export { readBusinessMutation as readAdminMutation } from "@/lib/business/http";
export function adminFailure(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError)
    return privateJson({ message: error.message }, error.status);
  if (error instanceof ZodError)
    return privateJson(
      { message: "Check the administration filters or request fields." },
      400,
    );
  if (error instanceof SyntaxError)
    return privateJson({ message: "Send valid JSON." }, 400);
  return privateJson(
    {
      message:
        "Unable to complete the administration request. Please try again.",
    },
    503,
  );
}
