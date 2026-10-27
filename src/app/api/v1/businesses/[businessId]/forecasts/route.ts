import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { generateForecast, listForecasts } from "@/lib/forecasting/service";
import { forecastFailure, readForecastQuery } from "@/lib/forecasting/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ businessId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    const query = readForecastQuery(request, ["page"]);
    return privateJson(
      await listForecasts(getDatabase(), user.id, businessId, query.page ?? 1),
    );
  } catch (error) {
    return forecastFailure(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    const input = await readBusinessMutation(request);
    const result = await generateForecast(
      getDatabase(),
      user.id,
      businessId,
      input,
    );
    return privateJson(result, result.alreadyGenerated ? 200 : 201);
  } catch (error) {
    return forecastFailure(error);
  }
}
