import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { listAlertRules } from "@/lib/alerts/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson({
      rules: await listAlertRules(getDatabase(), user.id, businessId),
    });
  } catch (error) {
    return businessFailure(error);
  }
}
