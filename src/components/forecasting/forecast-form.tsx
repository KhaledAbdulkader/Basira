"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChartNoAxesCombined } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BusinessProfile } from "@/lib/business/constants";
import { formatDate } from "@/lib/dashboard/format";
import {
  FORECAST_HORIZONS,
  FORECAST_OPTIONS,
  type ForecastEligibility,
  type ForecastMetric,
  type ForecastHorizon,
} from "@/lib/forecasting/contracts";

const inputClass =
  "mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm";
export function ForecastForm({
  business,
  initial,
}: {
  business: BusinessProfile;
  initial: ForecastEligibility;
}) {
  const router = useRouter();
  const [metric, setMetric] = useState<ForecastMetric>(initial.metricType);
  const [horizon, setHorizon] = useState<ForecastHorizon>(initial.horizon);
  const [review, setReview] = useState<ForecastEligibility | null>(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"review" | "generate" | null>(null);
  const [error, setError] = useState("");
  const base = `/api/v1/businesses/${business.id}/forecasts`;
  function reset() {
    setReview(null);
    setConfirmed(false);
    setError("");
  }
  async function action(kind: "review" | "generate") {
    if (
      kind === "generate" &&
      (!review?.eligible || (review.gapDays && !confirmed))
    )
      return;
    setBusy(kind);
    setError("");
    try {
      const response =
        kind === "review"
          ? await fetch(
              `${base}/eligibility?metricType=${metric}&horizon=${horizon}`,
              { cache: "no-store" },
            )
          : await fetch(base, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                metricType: metric,
                horizon,
                historyHash: review!.historyHash,
                confirmGaps: confirmed,
              }),
            });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setReview(null);
          setConfirmed(false);
        }
        throw new Error(
          result.message ?? "Unable to prepare the forecast. Try again.",
        );
      }
      if (kind === "review") {
        setReview(result);
        setConfirmed(false);
      } else
        router.push(`/forecasts/${result.item.id}?business=${business.id}`);
    } catch (error) {
      setError(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "Unable to reach Basira. Try again and check saved forecasts before retrying.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="rounded-2xl border bg-card p-5 sm:p-7"
      aria-labelledby="forecast-setup"
      aria-busy={!!busy}
    >
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-accent p-3 text-primary">
          <ChartNoAxesCombined size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 id="forecast-setup" className="text-lg font-semibold">
            Plan your next period
          </h2>
          <p className="text-sm text-muted-foreground">
            Review recorded history before generating a trend estimate.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="forecast-metric">
            Forecast metric
          </label>
          <select
            id="forecast-metric"
            className={inputClass}
            value={metric}
            disabled={!!busy}
            onChange={(e) => {
              setMetric(e.target.value as ForecastMetric);
              reset();
            }}
          >
            <option value="REVENUE">Revenue</option>
            <option value="EXPENSE">All expenses</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="forecast-horizon">
            Forecast horizon
          </label>
          <select
            id="forecast-horizon"
            className={inputClass}
            value={horizon}
            disabled={!!busy}
            onChange={(e) => {
              setHorizon(e.target.value as ForecastHorizon);
              reset();
            }}
          >
            {FORECAST_HORIZONS.map((value) => (
              <option key={value} value={value}>
                {FORECAST_OPTIONS[value].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {metric === "REVENUE"
          ? "Revenue uses recorded sale totals. Missing unit costs do not change revenue."
          : "All expenses includes Operating, Inventory Purchase, and Other spending. This is a spending forecast, not a profit or COGS calculation."}{" "}
        Amounts use {business.currency} and dates use {business.timezone}.
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        History uses up to 366 completed calendar days, ending yesterday. At
        least {FORECAST_OPTIONS[horizon].minimumDays} different dates must
        contain records for this metric. Gaps never increase that eligibility
        count.
      </p>
      <Button
        className="mt-4"
        variant="outline"
        disabled={!!busy}
        onClick={() => void action("review")}
      >
        {busy === "review" ? "Checking history…" : "Review history"}
      </Button>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {review && (
        <div className="mt-6 border-t pt-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Recorded dates", review.recordedDays],
              ["Required dates", review.minimumDays],
              ["Gaps in history", review.gapDays],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <p role="status" className="mt-4 text-sm leading-6">
            {review.message}
          </p>
          {review.trainingStart && (
            <p className="mt-2 text-sm text-muted-foreground">
              History: {formatDate(review.trainingStart)} –{" "}
              {formatDate(review.plan.trainingEnd)} ({review.totalDays} calendar
              days). Today’s incomplete activity and future-dated entries are
              excluded.
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Forecast: {formatDate(review.plan.forecastStart)} –{" "}
            {formatDate(review.plan.forecastEnd)}.{" "}
            {review.plan.granularity === "MONTH"
              ? "Three full calendar-month totals, calculated from daily projections."
              : "Daily estimates, starting tomorrow."}
          </p>
          {review.gapDays > 0 && (
            <details className="mt-4 rounded-xl border p-4 text-sm">
              <summary className="cursor-pointer font-medium">
                Review {review.gapDays} dates without records
              </summary>
              <p className="mt-2 text-muted-foreground">
                No record alone does not prove zero activity. If records are
                missing, add them before generating.
              </p>
              <ul
                className="mt-3 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
                aria-label="Dates without records"
                tabIndex={0}
              >
                {review.gapDates.map((date) => (
                  <li key={date}>{date}</li>
                ))}
              </ul>
            </details>
          )}
          {review.eligible && review.gapDays > 0 && (
            <label className="mt-5 flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={confirmed}
                disabled={!!busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I confirm that all {review.gapDays} listed dates had zero{" "}
                {metric === "REVENUE" ? "revenue" : "expenses"} for this
                business. Use zero for these gaps in this forecast only.
              </span>
            </label>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button
              disabled={
                !review.eligible || (review.gapDays > 0 && !confirmed) || !!busy
              }
              onClick={() => void action("generate")}
            >
              {busy === "generate"
                ? "Generating forecast…"
                : "Generate forecast"}
            </Button>
            {!review.eligible && (
              <Link
                className="text-sm font-medium text-primary underline"
                href="/imports"
              >
                Import historical records
              </Link>
            )}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Holt’s method estimates a linear trend. It does not model
            seasonality, promotions, or unexpected business changes. Review its
            backtest error before using the estimates for planning.
          </p>
        </div>
      )}
    </section>
  );
}
