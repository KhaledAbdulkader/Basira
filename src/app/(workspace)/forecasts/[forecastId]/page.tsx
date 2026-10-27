import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { getOwnedBusiness, BusinessError } from "@/lib/business/service";
import { businessIdSchema } from "@/lib/validation/business";
import { recordIdSchema } from "@/lib/validation/records";
import { getForecast } from "@/lib/forecasting/service";
import { ForecastResult } from "@/components/forecasting/forecast-result";

export default async function ForecastResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ forecastId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { forecastId } = await params;
  const query = await searchParams;
  const id = businessIdSchema.safeParse(query.business);
  if (!id.success || !recordIdSchema.safeParse(forecastId).success) notFound();
  let business, run;
  try {
    business = await getOwnedBusiness(getDatabase(), user.id, id.data);
    run = await getForecast(getDatabase(), user.id, business.id, forecastId);
  } catch (error) {
    if (error instanceof BusinessError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="min-w-0 space-y-5">
      <Link className="text-sm text-primary underline" href="/forecasts">
        Back to forecasts
      </Link>
      <p className="text-sm font-medium text-primary">{business.name}</p>
      <ForecastResult run={run} />
    </div>
  );
}
