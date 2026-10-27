import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure, readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { evaluateAlerts } from "@/lib/alerts/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson(
      await evaluateAlerts(
        getDatabase(),
        user.id,
        businessId,
        await readBusinessMutation(request),
      ),
    );
  } catch (error) {
    return businessFailure(error);
  }
}
