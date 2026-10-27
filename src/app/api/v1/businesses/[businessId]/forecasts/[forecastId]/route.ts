import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson } from "@/lib/http/request";
import { getForecast } from "@/lib/forecasting/service";
import { forecastFailure } from "@/lib/forecasting/http";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; forecastId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId, forecastId } = await params;
    return privateJson(
      await getForecast(getDatabase(), user.id, businessId, forecastId),
    );
  } catch (error) {
    return forecastFailure(error);
  }
}
