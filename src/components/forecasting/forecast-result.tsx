import { ForecastChart } from "./forecast-chart";
import { formatDate, formatMoney } from "@/lib/dashboard/format";
import { Decimal } from "@/lib/records/money";
import {
  FORECAST_OPTIONS,
  type ForecastDetail,
} from "@/lib/forecasting/contracts";

export function ForecastResult({ run }: { run: ForecastDetail }) {
  const assumedHoldout = run.backtest.filter((day) => !day.recorded).length;
  const worse = new Decimal(run.mae).gt(run.baselineMae);
  return (
    <div className="min-w-0 space-y-6">
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <p className="text-sm font-medium text-primary">
          {run.metricType === "REVENUE" ? "Revenue" : "All expenses"} ·{" "}
          {FORECAST_OPTIONS[run.horizon].label}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Saved forecast</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatDate(run.forecastStart)} – {formatDate(run.forecastEnd)} ·{" "}
          {run.currency} · {run.timezone}
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Estimated total for the forecast period
        </p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {formatMoney(run.total, run.currency)}
        </p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Generated{" "}
          {new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: run.timezone,
          }).format(new Date(run.createdAt))}
          . This is a saved snapshot; later record edits do not update it.
          Generate a new forecast to use current history.
        </p>
        {run.metricType === "EXPENSE" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Includes Operating, Inventory Purchase, and Other expenses. This
            projects recorded spending and is not estimated profit.
          </p>
        )}
      </section>
      <section
        className="min-w-0 rounded-2xl border bg-card p-5 sm:p-7"
        aria-labelledby="forecast-chart-heading"
      >
        <h2 id="forecast-chart-heading" className="text-lg font-semibold">
          History and forecast
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Daily values: last {Math.min(90, run.history.length)} historical dates
          and the selected forecast period. The break excludes today
          {run.granularity === "MONTH"
            ? " and the rest of the current month"
            : ""}
          .{" "}
          {run.granularity === "MONTH"
            ? "The totals below sum the daily forecasts into full calendar months."
            : ""}
        </p>
        <ForecastChart run={run} />
        <p className="mt-4 text-sm text-muted-foreground">
          Trend estimates do not model seasonality, promotions, or unexpected
          events.
          {run.clampedCount > 0
            ? ` ${run.clampedCount} daily predictions were below zero and were set to zero.`
            : ""}
        </p>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Forecast values</h2>
        <div
          className="mt-4 max-h-96 overflow-auto rounded-lg border"
          tabIndex={0}
          role="region"
          aria-label="Forecast values"
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="p-3">
                  {run.granularity === "MONTH" ? "Full calendar month" : "Date"}
                </th>
                <th className="p-3 text-right">Estimated amount</th>
              </tr>
            </thead>
            <tbody>
              {run.points.map((point) => (
                <tr key={point.date} className="border-t">
                  <th scope="row" className="p-3 font-normal">
                    {run.granularity === "MONTH"
                      ? `${formatDate(point.date)} – ${formatDate(point.endDate)}`
                      : formatDate(point.date)}
                  </th>
                  <td className="p-3 text-right whitespace-nowrap">
                    {formatMoney(point.value, run.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Backtest performance</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The last {run.backtestCount} historical days were held out while
          fitting parameters on the earlier {run.trainingCount} days. These are
          daily errors for that holdout period, not a guarantee of future
          performance.
          {run.horizon === "MONTHS_3"
            ? " The 90-day backtest does not measure calendar-month total error."
            : ""}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Daily MAE", formatMoney(run.mae, run.currency)],
            [
              "MAPE · nonzero actuals",
              run.mape === null
                ? "Not available"
                : `${new Decimal(run.mape).toDecimalPlaces(2).toFixed(2)}%`,
            ],
            ["Baseline daily MAE", formatMoney(run.baselineMae, run.currency)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          MAE is the mean absolute error in {run.currency}. MAPE uses{" "}
          {run.mapeSamples} of {run.backtestCount} dates;{" "}
          {run.backtestCount - run.mapeSamples} zero actuals are excluded.
          Near-zero actuals can make percentage errors very large.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          The baseline repeats the last training-day value for every held-out
          date.{" "}
          {worse
            ? "The baseline had lower error than Holt on this holdout. Treat this trend forecast cautiously."
            : "Compare these errors with the scale of your daily activity."}
          {assumedHoldout > 0
            ? ` This backtest includes ${assumedHoldout} user-confirmed zero gaps; its scores depend on that assumption.`
            : ""}
        </p>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">
            Model settings and historical coverage
          </summary>
          <p className="mt-3 leading-6 text-muted-foreground">
            Holt’s linear trend method · {run.algorithm}. Level smoothing α ={" "}
            {run.alpha}; trend smoothing β = {run.beta}. Initial level is the
            first value and initial trend is the difference between the first
            two values. Parameters are selected on training dates only; the
            final state is then fitted to all {run.history.length} dates with
            those parameters.
          </p>
          <p className="mt-2 text-muted-foreground">
            History: {formatDate(run.trainingStart)} –{" "}
            {formatDate(run.trainingEnd)}. {run.recordedDays} recorded dates;{" "}
            {run.gapDays} explicitly confirmed zero gaps. At most 366 completed
            dates are considered. Missing days before the first recorded date
            are not added.
          </p>
        </details>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">
            View held-out actuals and predictions
          </summary>
          <div
            className="mt-3 max-h-80 overflow-auto rounded-lg border"
            tabIndex={0}
            role="region"
            aria-label="Backtest values"
          >
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {["Date", "Actual", "Holt", "Baseline", "Source"].map(
                    (label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {run.backtest.map((day) => (
                  <tr key={day.date} className="border-t">
                    <td className="p-3 whitespace-nowrap">{day.date}</td>
                    {[day.actual, day.predicted, day.baseline].map(
                      (value, i) => (
                        <td key={i} className="p-3 whitespace-nowrap">
                          {formatMoney(value, run.currency)}
                        </td>
                      ),
                    )}
                    <td className="p-3">
                      {day.recorded ? "Recorded" : "Confirmed zero gap"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Displayed amounts are rounded to the currency. Error metrics use
            unrounded model predictions.
          </p>
        </details>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">
            View all historical daily values
          </summary>
          <div
            className="mt-3 max-h-80 overflow-auto rounded-lg border"
            tabIndex={0}
            role="region"
            aria-label="Historical daily values"
          >
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {run.history.map((day) => (
                  <tr key={day.date} className="border-t">
                    <td className="p-3 whitespace-nowrap">{day.date}</td>
                    <td className="p-3 whitespace-nowrap">
                      {formatMoney(day.value, run.currency)}
                    </td>
                    <td className="p-3">
                      {day.recorded ? "Recorded" : "Confirmed zero gap"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
