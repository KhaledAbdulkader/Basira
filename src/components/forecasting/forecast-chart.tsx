"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ForecastDetail } from "@/lib/forecasting/contracts";
import { addDays } from "@/lib/dashboard/period";
import { daysBetween } from "@/lib/forecasting/calendar";
import { formatDate, formatMoney } from "@/lib/dashboard/format";

export function ForecastChart({ run }: { run: ForecastDetail }) {
  const historical = new Map(
    run.history.slice(-90).map((day) => [day.date, day]),
  );
  const projected = new Map(run.dailyForecast.map((day) => [day.date, day]));
  const start = run.history.slice(-90)[0]!.date;
  const data = Array.from(
    { length: daysBetween(start, run.forecastEnd) + 1 },
    (_, i) => {
      const date = addDays(start, i),
        actual = historical.get(date),
        estimate = projected.get(date);
      return {
        date,
        actual: actual?.value ?? null,
        estimate: estimate?.value ?? null,
        actualPlot: actual ? Number(actual.value) : null,
        estimatePlot: estimate ? Number(estimate.value) : null,
        assumedZero: actual ? !actual.recorded : false,
      };
    },
  );
  const tick = { fontSize: 11, fill: "var(--muted-foreground)" };
  return (
    <div
      className="h-80 min-w-0"
      role="group"
      aria-label="Daily historical amounts and future forecast chart"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={data}
          margin={{ top: 16, right: 16, left: -15, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={tick}
            tickFormatter={(date) => String(date).slice(5)}
            minTickGap={36}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={tick}
            width={76}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              new Intl.NumberFormat("en", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(value)
            }
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as (typeof data)[number];
              return (
                <div className="rounded-xl border bg-card p-3 text-xs shadow-sm">
                  <p className="mb-2 font-medium">
                    {formatDate(String(label))}
                  </p>
                  {row.actual !== null && (
                    <p>
                      Historical: {formatMoney(row.actual, run.currency)}
                      {row.assumedZero ? " (confirmed zero gap)" : ""}
                    </p>
                  )}
                  {row.estimate !== null && (
                    <p>Forecast: {formatMoney(row.estimate, run.currency)}</p>
                  )}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="linear"
            dataKey="actualPlot"
            name="Historical daily total"
            stroke="var(--chart-revenue)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="estimatePlot"
            name="Forecast daily estimate"
            stroke="var(--chart-expense)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
