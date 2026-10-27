import { AccessError } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/server";
import { privateJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return privateJson({ user: await requireUser() });
  } catch (error) {
    if (error instanceof AccessError)
      return privateJson({ message: error.message }, error.status);
    return privateJson(
      { message: "Unable to check your session. Please try again." },
      503,
    );
  }
}
