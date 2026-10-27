import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure, readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { updateAlertStatus } from "@/lib/alerts/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ businessId: string; alertId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId, alertId } = await params;
    return privateJson({
      alert: await updateAlertStatus(
        getDatabase(),
        user.id,
        businessId,
        alertId,
        await readBusinessMutation(request),
      ),
    });
  } catch (error) {
    return businessFailure(error);
  }
}
