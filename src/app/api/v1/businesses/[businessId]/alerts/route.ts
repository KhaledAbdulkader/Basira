import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { getAlerts } from "@/lib/alerts/service";
import { readAlertQuery } from "@/lib/alerts/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson(
      await getAlerts(
        getDatabase(),
        user.id,
        businessId,
        readAlertQuery(request),
      ),
    );
  } catch (error) {
    return businessFailure(error);
  }
}
