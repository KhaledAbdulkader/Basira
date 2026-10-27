import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson } from "@/lib/http/request";
import { getForecastEligibility } from "@/lib/forecasting/service";
import { forecastFailure, readForecastQuery } from "@/lib/forecasting/http";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson(
      await getForecastEligibility(
        getDatabase(),
        user.id,
        businessId,
        readForecastQuery(request, ["metricType", "horizon"]),
      ),
    );
  } catch (error) {
    return forecastFailure(error);
  }
}
