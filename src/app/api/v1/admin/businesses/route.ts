import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson } from "@/lib/http/request";
import { adminFailure } from "@/lib/admin/http";
import { adminQuery, adminBusinessesQuery } from "@/lib/admin/contracts";
import { adminBusinesses } from "@/lib/admin/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser("ADMIN");
    const query = adminQuery(request);

    return privateJson(
      await adminBusinesses(
        getDatabase(),
        user.id,
        adminBusinessesQuery.parse(query),
      ),
    );
  } catch (error) {
    return adminFailure(error);
  }
}
