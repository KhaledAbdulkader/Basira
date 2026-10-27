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
  BarChart,
  Bar,
} from "recharts";
import type { DashboardData } from "@/lib/dashboard/service";
import { formatCount, formatDate, formatMoney } from "@/lib/dashboard/format";

const compact = (value: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--foreground)",
  fontSize: 12,
};
const colors = {
  revenue: "var(--chart-revenue)",
  expenses: "var(--chart-expense)",
  profit: "var(--chart-profit)",
};

export function FinancialChart({
  series,
  currency,
}: {
  series: DashboardData["series"];
  currency: string;
}) {
  const data = series.map((row) => ({
    ...row,
    revenuePlot: Number(row.revenue),
    expensePlot: Number(row.totalExpenses),
    profitPlot: Number(row.profit),
  }));
  return (
    <div
      className="h-72 min-w-0"
      role="group"
      aria-label="Daily revenue, all expenses and estimated profit chart"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 12, left: -15, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={axis}
            tickFormatter={(date) => String(date).slice(5)}
            minTickGap={32}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={axis}
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div style={tooltipStyle} className="p-3">
                  <p className="mb-2 font-medium">
                    {formatDate(String(label))}
                  </p>
                  {payload.map((entry) => {
                    const row =
                      entry.payload as DashboardData["series"][number];
                    const amount =
                      entry.dataKey === "revenuePlot"
                        ? row.revenue
                        : entry.dataKey === "expensePlot"
                          ? row.totalExpenses
                          : row.profit;
                    return (
                      <p key={String(entry.dataKey)}>
                        {entry.name}: {formatMoney(amount, currency)}
                      </p>
                    );
                  })}
                </div>
              ) : null
            }
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
          <Line
            name="Revenue"
            dataKey="revenuePlot"
            stroke={colors.revenue}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name="All expenses"
            dataKey="expensePlot"
            stroke={colors.expenses}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name="Estimated profit"
            dataKey="profitPlot"
            stroke={colors.profit}
            strokeWidth={2}
            strokeDasharray="2 3"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function CustomerChart({ series }: { series: DashboardData["series"] }) {
  return (
    <div
      role="group"
      className="h-72 min-w-0"
      aria-label="Daily customer visits chart"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={series}
          margin={{ top: 12, right: 12, left: -15, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={axis}
            tickFormatter={(date) => String(date).slice(5)}
            minTickGap={32}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={axis}
            tickFormatter={compact}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div style={tooltipStyle} className="p-3">
                  {formatDate(String(label))}
                  <p>
                    Customer visits: {formatCount(Number(payload[0]?.value))}
                  </p>
                </div>
              ) : null
            }
          />
          <Line
            name="Customer visits"
            dataKey="visits"
            stroke={colors.revenue}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreakdownChart({
  rows,
  currency,
  label,
}: {
  rows: { name: string; value: string }[];
  currency?: string;
  label: string;
}) {
  const data = rows.map((row) => ({ ...row, plot: Number(row.value) }));
  return (
    <div
      style={{ height: Math.max(180, rows.length * 40) }}
      className="min-w-0"
      role="group"
      aria-label={label}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 14, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={axis}
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
            allowDecimals={Boolean(currency)}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={94}
            tick={axis}
            tickFormatter={(value) =>
              String(value).length > 13
                ? `${String(value).slice(0, 12)}…`
                : String(value)
            }
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div style={tooltipStyle} className="max-w-64 p-3 break-words">
                  {String(payload[0]?.payload.name)}
                  <p>
                    {currency
                      ? formatMoney(String(payload[0]?.payload.value), currency)
                      : formatCount(Number(payload[0]?.payload.value))}
                  </p>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="plot"
            name={label}
            fill={colors.revenue}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            maxBarSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
