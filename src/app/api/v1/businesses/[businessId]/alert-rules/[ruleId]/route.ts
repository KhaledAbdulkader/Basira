import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure, readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { updateAlertRule } from "@/lib/alerts/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ businessId: string; ruleId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId, ruleId } = await params;
    return privateJson(
      await updateAlertRule(
        getDatabase(),
        user.id,
        businessId,
        ruleId,
        await readBusinessMutation(request),
      ),
    );
  } catch (error) {
    return businessFailure(error);
  }
}
