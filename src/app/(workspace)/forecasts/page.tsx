import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import {
  listForecasts,
  getForecastEligibility,
} from "@/lib/forecasting/service";
import {
  forecastPageSchema,
  FORECAST_OPTIONS,
} from "@/lib/forecasting/contracts";
import { formatDate, formatMoney } from "@/lib/dashboard/format";
import { ForecastForm } from "@/components/forecasting/forecast-form";

export default async function ForecastsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business)
    return (
      <section className="rounded-2xl border bg-card p-8">
        <h1 className="text-2xl font-semibold">Forecasts</h1>
        <p className="my-4 text-muted-foreground">
          Create a business and add historical records to begin forecasting.
        </p>
        <Link className="text-primary underline" href="/businesses/new">
          Create your first business
        </Link>
      </section>
    );
  const query = await searchParams,
    parsed = forecastPageSchema.safeParse(query.page ?? 1);
  if (!parsed.success)
    return (
      <section>
        <h1 className="text-2xl font-semibold">
          Check the history page number
        </h1>
        <Link className="text-primary underline" href="/forecasts">
          Reset history
        </Link>
      </section>
    );
  const [initial, result] = await Promise.all([
    getForecastEligibility(getDatabase(), user.id, business.id, {}),
    listForecasts(getDatabase(), user.id, business.id, parsed.data),
  ]);
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">{business.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Forecasts
        </h1>
        <p className="mt-2 text-muted-foreground">
          Explore where recorded revenue and spending trends could lead.
        </p>
      </header>
      <ForecastForm key={business.id} business={business} initial={initial} />
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Saved forecasts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each run preserves its history, assumptions, parameters, and backtest
          results. The same unchanged history and options reuse an existing run.
        </p>
        {!result.items.length ? (
          <p className="py-8 text-sm text-muted-foreground">
            {result.total
              ? "No forecasts on this page."
              : "No forecasts yet. Review your history above to get started."}
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {result.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col justify-between gap-2 py-4 sm:flex-row"
              >
                <div>
                  <Link
                    className="font-medium text-primary underline"
                    href={`/forecasts/${item.id}?business=${business.id}`}
                  >
                    {item.metricType === "REVENUE" ? "Revenue" : "All expenses"}{" "}
                    · {FORECAST_OPTIONS[item.horizon].label}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(item.forecastStart)} –{" "}
                    {formatDate(item.forecastEnd)} · Generated{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: business.timezone,
                    }).format(new Date(item.createdAt))}
                  </p>
                </div>
                <p className="text-sm font-medium">
                  {formatMoney(item.total, item.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-4 text-sm">
          <p>
            {result.total} forecasts · Page {result.page} of{" "}
            {Math.max(1, Math.ceil(result.total / result.pageSize))}
          </p>
          <div className="flex gap-4">
            {result.page > 1 && (
              <Link
                className="text-primary underline"
                href={`/forecasts?page=${result.page - 1}`}
              >
                Previous forecasts
              </Link>
            )}
            {result.page * result.pageSize < result.total && (
              <Link
                className="text-primary underline"
                href={`/forecasts?page=${result.page + 1}`}
              >
                Next forecasts
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
