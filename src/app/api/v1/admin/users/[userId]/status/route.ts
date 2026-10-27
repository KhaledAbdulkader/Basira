import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson } from "@/lib/http/request";
import { readAdminMutation, adminFailure } from "@/lib/admin/http";
import { changeUserStatus } from "@/lib/admin/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireUser("ADMIN");
    return privateJson(
      await changeUserStatus(
        getDatabase(),
        actor.id,
        (await params).userId,
        await readAdminMutation(request),
      ),
    );
  } catch (error) {
    return adminFailure(error);
  }
}
