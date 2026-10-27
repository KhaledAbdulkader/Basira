import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/dashboard/format";
import {
  FORECAST_OPTIONS,
  type ForecastListItem,
} from "@/lib/forecasting/contracts";

export function LatestForecast({
  run,
  businessId,
  timezone,
}: {
  run: ForecastListItem | undefined;
  businessId: string;
  timezone: string;
}) {
  return (
    <section
      aria-labelledby="latest-forecast-heading"
      className="rounded-2xl border bg-card p-5 sm:p-7"
    >
      <h2 id="latest-forecast-heading" className="text-lg font-semibold">
        Latest saved forecast
      </h2>
      {run ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {run.metricType === "REVENUE" ? "Revenue" : "All expenses"} ·{" "}
            {FORECAST_OPTIONS[run.horizon].label} ·{" "}
            {formatDate(run.forecastStart)} – {formatDate(run.forecastEnd)}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Estimated total for the saved forecast period
          </p>
          <p className="mt-1 break-words text-2xl font-semibold">
            {formatMoney(run.total, run.currency)}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Generated{" "}
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: timezone,
            }).format(new Date(run.createdAt))}
            . This snapshot uses its own dates, independently of the dashboard
            filter. Later record changes do not update it.
          </p>
          <Link
            className="mt-4 inline-block text-sm font-medium text-primary underline"
            href={`/forecasts/${run.id}?business=${businessId}`}
          >
            View saved forecast
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            No saved forecast for this business. Review your historical data
            before generating an estimate.
          </p>
          <Link
            className="mt-4 inline-block text-sm font-medium text-primary underline"
            href="/forecasts"
          >
            Review forecast history
          </Link>
        </>
      )}
    </section>
  );
}
