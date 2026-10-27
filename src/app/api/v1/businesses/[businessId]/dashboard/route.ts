import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { getDashboard } from "@/lib/dashboard/service";
import { evaluateAlerts } from "@/lib/alerts/service";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    const search = new URL(request.url).searchParams;
    if ([...search.keys()].some((key) => search.getAll(key).length !== 1))
      return privateJson(
        { message: "Use each dashboard filter only once." },
        400,
      );
    const data = await getDashboard(
      getDatabase(),
      user.id,
      businessId,
      Object.fromEntries(search),
    );
    await evaluateAlerts(getDatabase(), user.id, businessId);
    return privateJson(data);
  } catch (error) {
    return businessFailure(error);
  }
}
