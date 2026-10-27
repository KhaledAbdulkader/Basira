import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson } from "@/lib/http/request";
import { adminFailure } from "@/lib/admin/http";
import { adminQuery, adminUsersQuery } from "@/lib/admin/contracts";
import { adminUsers } from "@/lib/admin/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser("ADMIN");
    const query = adminQuery(request);

    return privateJson(
      await adminUsers(getDatabase(), user.id, adminUsersQuery.parse(query)),
    );
  } catch (error) {
    return adminFailure(error);
  }
}
