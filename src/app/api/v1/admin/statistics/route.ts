import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson, RequestError } from "@/lib/http/request";
import { adminFailure } from "@/lib/admin/http";
import { adminQuery } from "@/lib/admin/contracts";
import { adminStatistics } from "@/lib/admin/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser("ADMIN");
    const query = adminQuery(request);
    if (Object.keys(query).length)
      throw new RequestError(400, "Statistics do not accept filters.");
    return privateJson(await adminStatistics(getDatabase(), user.id));
  } catch (error) {
    return adminFailure(error);
  }
}
