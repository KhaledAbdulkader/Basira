import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, CircleHelp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/dashboard/service";
import { formatCount, formatDate, formatMoney } from "@/lib/dashboard/format";
import { PeriodFilter } from "./period-filter";
import { BreakdownChart, CustomerChart, FinancialChart } from "./charts";

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 mb-5 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      {children}
    </section>
  );
}
function Empty({
  children,
  href,
  action,
}: {
  children: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center">
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        {children}
      </p>
      <Link
        href={href}
        className="mt-4 text-sm font-medium text-primary underline underline-offset-4"
      >
        {action}
      </Link>
    </div>
  );
}
function Metric({
  title,
  value,
  previous,
  help,
  accent = false,
}: {
  title: string;
  value: string;
  previous: string;
  help: string;
  accent?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={`min-w-0 rounded-2xl border p-5 ${accent ? "border-primary/30 bg-accent/60" : "bg-card"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
        <details className="group relative shrink-0">
          <summary
            aria-label={`About ${title}`}
            className="cursor-pointer list-none rounded text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <CircleHelp size={15} aria-hidden="true" />
          </summary>
          <p className="absolute top-7 right-0 z-10 w-52 rounded-lg border bg-card p-3 text-xs leading-5 shadow-lg">
            {help}
          </p>
        </details>
      </div>
      <p
        className="mt-3 text-[22px] leading-tight font-semibold tracking-tight break-words tabular-nums"
        data-testid="metric-value"
      >
        {value}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{previous}</p>
    </section>
  );
}
const treatment: Record<string, string> = {
  OPERATING: "Operating",
  INVENTORY_PURCHASE: "Inventory purchase",
  OTHER: "Other (excluded from profit)",
  MIXED: "Multiple classifications",
};
const tableClass =
  "w-full text-left text-xs [&_td]:border-t [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-3 [&_th]:font-medium";

export function Dashboard({ data }: { data: DashboardData }) {
  const { business, current: k, previous: p, comparison, period } = data;
  const money = (value: string) => formatMoney(value, business.currency);
  const prevMoney = (value: string | null) =>
    value === null ? "Previous: not available" : `Previous: ${money(value)}`;
  const delta = (value: string | null) =>
    value === null
      ? "Not available"
      : `${Number(value) > 0 ? "+" : ""}${value}%`;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-primary">
            Your business at a glance
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <h2 className="mt-2 text-sm font-medium break-words">
            {business.name}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {business.currency} · {business.timezone.replaceAll("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/sales">
              <Plus size={15} aria-hidden="true" />
              Record sale
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/expenses">Record expense</Link>
          </Button>
        </div>
      </header>
      <PeriodFilter
        key={`${business.id}-${period.preset}-${period.current.from}-${period.current.to}`}
        period={period}
      />
      <div className="flex flex-wrap justify-between gap-2 text-xs leading-5 text-muted-foreground">
        <p>
          <strong className="font-medium text-foreground">
            {formatDate(period.current.from)} – {formatDate(period.current.to)}
          </strong>{" "}
          · {period.current.days} days, inclusive
        </p>
        <p>
          Compared with {formatDate(period.previous.from)} –{" "}
          {formatDate(period.previous.to)}
        </p>
      </div>
      {!data.hasFinancialRecords &&
        !k.customerDays &&
        !data.sentiment.total && (
          <div className="rounded-xl border border-dashed bg-card p-6">
            <h2 className="font-semibold">No records in this period</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add sales, expenses, or customer counts to see your business
              activity, or choose a different period. The figures below reflect
              only recorded data.
            </p>
          </div>
        )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Revenue"
          value={money(k.revenue)}
          previous={prevMoney(p.revenue)}
          help="The total value of recorded sales in the selected period."
        />
        <Metric
          title="Operating expenses"
          value={money(k.operating)}
          previous={prevMoney(p.operating)}
          help="Recorded expenses classified as Operating. Inventory purchases and Other spending are excluded here."
        />
        <Metric
          title="Estimated profit"
          value={money(k.profit)}
          previous={prevMoney(p.profit)}
          accent
          help="Revenue minus known historical cost of sold items and Operating expenses. Missing costs can overstate this estimate."
        />
        <Metric
          title="Estimated profit margin"
          value={k.margin === null ? "Not available" : `${k.margin}%`}
          previous={
            p.margin === null
              ? "Previous: not available"
              : `Previous: ${p.margin}%`
          }
          help="Estimated profit divided by revenue, as a percentage. Not available when revenue is zero."
        />
        <Metric
          title="Known cost of sales"
          value={money(k.cogs)}
          previous={prevMoney(p.cogs)}
          help="Cost of goods sold (COGS): quantity × historical unit cost, for sales with a known cost. A recorded zero cost is included."
        />
        <Metric
          title="Sales growth"
          value={delta(comparison.revenueGrowth)}
          previous={`${formatCount(p.transactions)} transaction${p.transactions === 1 ? "" : "s"} in the previous period`}
          help="Percentage change in revenue against the preceding equal-length period. Not available if previous revenue is zero."
        />
        <Metric
          title="Customer visits"
          value={k.customerDays ? formatCount(k.visits) : "Not recorded"}
          previous={
            p.customerDays
              ? `Previous: ${formatCount(p.visits)} · Change: ${delta(comparison.visitGrowth)}`
              : "Previous: not recorded"
          }
          help="Sum of recorded daily customer visits, including repeat visits. These are not unique people; missing dates are not assumed to be zero."
        />
        <Metric
          title="Average sale value"
          value={
            k.averageSale === null ? "Not available" : money(k.averageSale)
          }
          previous={`${formatCount(k.transactions)} transaction${k.transactions === 1 ? "" : "s"} · ${prevMoney(p.averageSale)}`}
          help="Revenue divided by the number of sale entries. Each entry represents one complete transaction for one product or service."
        />
      </div>
      <section
        aria-label="Data coverage and profit calculation"
        className="rounded-xl border bg-card p-5 text-sm leading-6"
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <CircleHelp size={17} className="text-primary" aria-hidden="true" />
          How complete is this picture?
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p>
              <strong>
                Cost-data coverage:{" "}
                {k.costCoverage === null
                  ? "Not applicable — no sales"
                  : `${k.costCoverage}% (${formatCount(k.costKnown)} of ${formatCount(k.transactions)} sales)`}
                .
              </strong>
            </p>
            <p className="text-muted-foreground">
              {k.costMissing
                ? `${formatCount(k.costMissing)} sale${k.costMissing === 1 ? " has" : "s have"} no unit cost. Missing costs are excluded from estimated profit, so profit may be overstated.`
                : "Estimated profit uses recorded historical costs and operating expenses."}{" "}
              Previous coverage:{" "}
              {p.costCoverage === null
                ? "not applicable"
                : `${p.costCoverage}%`}
              .
            </p>
          </div>
          <div>
            <p>
              <strong>
                Customer counts: {k.customerDays} of {period.current.days} days
                recorded.
              </strong>
            </p>
            <p className="text-muted-foreground">
              Previous period: {p.customerDays} of {period.previous.days} days.
              Visit comparisons may reflect different recording coverage. Today
              may still be incomplete.
            </p>
          </div>
        </div>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Estimated profit = Revenue − Known cost of sales − Operating expenses.
          Inventory purchases ({money(k.inventory)}) and Other spending (
          {money(k.other)}) are shown separately and excluded from profit.
          Review Other classifications to include operating costs correctly.
        </p>
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Financial trends"
          description={`Daily recorded amounts in ${business.currency}. All expenses includes operating, inventory and Other spending. Profit deducts operating expenses and known costs only.`}
        >
          {data.hasFinancialRecords ? (
            <FinancialChart series={data.series} currency={business.currency} />
          ) : (
            <Empty href="/sales" action="Add a sale">
              No sales or expenses in this period.
            </Empty>
          )}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            A zero on a day without financial records means no amount was
            recorded; it does not confirm that the business was inactive. Profit
            uses available costs only.
          </p>
        </Panel>
        <Panel
          title="Customer trend"
          description="Daily visits, including repeat visits. Gaps indicate missing entries; an entered zero stays zero."
        >
          {k.customerDays ? (
            <CustomerChart series={data.series} />
          ) : (
            <Empty href="/customer-metrics" action="Record customer visits">
              No customer counts in this period.
            </Empty>
          )}
        </Panel>
      </div>
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">
          View daily chart data
        </summary>
        <div
          className="mt-4 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Daily chart data table"
        >
          <table className={tableClass}>
            <caption className="sr-only">
              Recorded daily amounts and customer visits
            </caption>
            <thead>
              <tr>
                {[
                  "Date",
                  "Revenue",
                  "Operating expenses",
                  "All expenses",
                  "Estimated profit",
                  "Visits",
                  "Sales missing cost",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.series.map((row) => (
                <tr key={row.date}>
                  <th scope="row" className="whitespace-nowrap">
                    {row.date}
                  </th>
                  <td className="whitespace-nowrap">{money(row.revenue)}</td>
                  <td className="whitespace-nowrap">{money(row.operating)}</td>
                  <td className="whitespace-nowrap">
                    {money(row.totalExpenses)}
                  </td>
                  <td className="whitespace-nowrap">{money(row.profit)}</td>
                  <td>
                    {row.visits === null
                      ? "Not recorded"
                      : formatCount(row.visits)}
                  </td>
                  <td>{row.costMissing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel
          title="Revenue by product or service"
          description="Top five by recorded revenue. Historical item names are retained; unlinked sales are grouped separately."
        >
          {data.topRevenue.length ? (
            <>
              <BreakdownChart
                rows={data.topRevenue.map((row) => ({
                  name: row.name,
                  value: row.revenue,
                }))}
                currency={business.currency}
                label="Product revenue"
              />
              <ul className="mt-3 space-y-2 text-xs">
                {data.topRevenue.map((row, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{row.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {money(row.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-5 border-t pt-4 text-sm font-medium">
                Best sellers by quantity
              </h3>
              <ol className="mt-3 space-y-2 text-xs">
                {data.bestSelling.map((row, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">
                      {index + 1}. {row.name}
                    </span>
                    <span className="shrink-0">{row.quantity} sold</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                Quantities can use different units across products and services.
              </p>
            </>
          ) : (
            <Empty href="/sales" action="Record a sale">
              Product insights appear when you record sales.
            </Empty>
          )}
        </Panel>
        <Panel
          title="Expense breakdown"
          description={`All recorded expenses: ${money(k.totalExpenses)}. Classification is the treatment saved on each expense.`}
        >
          {data.categories.length ? (
            <>
              <BreakdownChart
                rows={data.categories.map((row) => ({
                  name: row.name,
                  value: row.amount,
                }))}
                currency={business.currency}
                label="Expense amount"
              />
              <ul className="mt-3 space-y-3 text-xs">
                {data.categories.map((row, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">
                      {row.name}
                      <span className="mt-1 block text-muted-foreground">
                        {treatment[row.classification]}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {money(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty href="/expenses" action="Record an expense">
              No expenses in this period.
            </Empty>
          )}
        </Panel>
      </div>
      <Panel
        title="Customer feedback"
        description="Sentiment reflects completed analyses only. Unanalyzed or failed feedback remains Unknown."
      >
        {data.sentiment.total ? (
          <div className="grid items-center gap-6 md:grid-cols-2">
            <BreakdownChart
              rows={["positive", "neutral", "negative", "unknown"].map(
                (key) => ({
                  name: key[0]!.toUpperCase() + key.slice(1),
                  value: String(
                    data.sentiment[
                      key as "positive" | "neutral" | "negative" | "unknown"
                    ],
                  ),
                }),
              )}
              label="Feedback count"
            />
            <div>
              <dl className="grid grid-cols-2 gap-4">
                {(["positive", "neutral", "negative", "unknown"] as const).map(
                  (key) => (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground capitalize">
                        {key}
                      </dt>
                      <dd className="mt-1 text-xl font-semibold">
                        {data.sentiment[key]}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <p className="mt-5 text-xs leading-6 text-muted-foreground">
                {data.sentiment.total} feedback entries ·{" "}
                {data.sentiment.pending} awaiting analysis ·{" "}
                {data.sentiment.failed} failed. Unknown entries are included in
                this total.
              </p>
              <Link
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
                href="/feedback"
              >
                View feedback
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <Empty href="/feedback" action="Add customer feedback">
            No feedback in this period.
          </Empty>
        )}
      </Panel>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-primary">
        <Link href={`/businesses/${business.id}`}>Business settings</Link>
        <Link href="/businesses">View all businesses</Link>
        <Link href="/expense-categories">Manage expense categories</Link>
      </div>
    </div>
  );
}
