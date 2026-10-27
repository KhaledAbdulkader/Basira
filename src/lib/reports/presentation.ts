import { Decimal } from "@/lib/records/money";
import { growth } from "@/lib/dashboard/calculations";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import type { ReportDetail } from "./contracts";
export type ReportSection = {
  title: string;
  note?: string;
  paragraphs?: string[];
  columns?: string[];
  rows?: string[][];
};
export function reportSections(report: ReportDetail): ReportSection[] {
  const c = report.snapshot.context,
    m = c.current;
  const money = (n: string) => formatMoney(n, report.currency);
  const percentage = (n: string | null) =>
    n === null ? "Not available" : `${n}%`;
  const count = (n: number) => String(n);
  const analyzed =
    c.sentiment.positive + c.sentiment.neutral + c.sentiment.negative;
  const share = (n: number) =>
    analyzed
      ? `${new Decimal(n).div(analyzed).times(100).toFixed(2)}%`
      : "Not available";
  const sections: ReportSection[] = [
    {
      title: "Recorded performance summary",
      paragraphs: report.summary.split("\n\n"),
    },
    ...(report.aiSummary
      ? [
          {
            title: "AI executive summary",
            note: `Optional interpretation by ${report.aiModel}. Verify against the recorded figures. Generated ${report.aiCompletedAt?.replace("T", " ").slice(0, 19)} UTC.`,
            paragraphs: [report.aiSummary],
          },
        ]
      : []),
    {
      title: "Financial performance",
      columns: ["Measure", "Recorded value"],
      rows: [
        ["Revenue", money(m.revenue)],
        ["All expenses", money(m.totalExpenses)],
        ["Operating expenses (profit deduction)", money(m.operating)],
        ["Inventory purchases (excluded from profit)", money(m.inventory)],
        ["Other spending (excluded from profit)", money(m.other)],
        ["Known historical COGS", money(m.cogs)],
        ["Estimated profit", money(m.profit)],
        ["Estimated profit margin", percentage(m.margin)],
        ["Sales transactions", count(m.transactions)],
        [
          "Average single-product transaction",
          m.averageSale === null ? "Not available" : money(m.averageSale),
        ],
        [
          "Cost-data coverage",
          `${m.costKnown}/${m.transactions} sales; ${percentage(m.costCoverage)}`,
        ],
        ["Sales missing historical costs", count(m.costMissing)],
      ],
      note: "Estimated profit = revenue - known historical COGS - operating expenses. Cost coverage does not prove all activity was entered.",
    },
    {
      title: "Preceding-period comparison",
      note: `${formatDate(c.comparisonPeriod.from)} - ${formatDate(c.comparisonPeriod.to)} (${c.comparisonPeriod.days} days). Zero baseline growth is unavailable.`,
      columns: ["Measure", "Preceding period", "Current period", "Change"],
      rows: [
        [
          "Revenue",
          money(c.previous.revenue),
          money(m.revenue),
          percentage(c.comparison.revenueGrowth),
        ],
        [
          "All expenses",
          money(c.previous.totalExpenses),
          money(m.totalExpenses),
          percentage(growth(m.totalExpenses, c.previous.totalExpenses)),
        ],
        [
          "Estimated profit",
          money(c.previous.profit),
          money(m.profit),
          percentage(growth(m.profit, c.previous.profit)),
        ],
        [
          "Cost coverage",
          percentage(c.previous.costCoverage),
          percentage(m.costCoverage),
          "See missing-cost caveats",
        ],
      ],
    },
    {
      title: "Customer visits",
      paragraphs: [
        `${m.visits} recorded visits across ${m.customerDays}/${c.period.days} calendar days. Visits include repeats, not unique people or retention. Missing dates are unknown.`,
      ],
    },
    {
      title: "Top products and services by revenue",
      columns: ["Historical name", "Revenue", "Quantity", "Transactions"],
      rows: c.topProductsByRevenue.map((p) => [
        p.name,
        money(p.revenue),
        p.quantity,
        count(p.transactions),
      ]),
      note: "Up to five historical item-name groups. Catalog edits do not rewrite sale snapshots.",
    },
    {
      title: "Top products and services by quantity",
      columns: ["Historical name", "Quantity", "Revenue"],
      rows: c.topProductsByQuantity.map((p) => [
        p.name,
        p.quantity,
        money(p.revenue),
      ]),
    },
    {
      title: "Expense breakdown",
      columns: ["Category", "Historical classification", "Amount"],
      rows: c.expenseBreakdown.map((e) => [
        e.name,
        e.classification.replaceAll("_", " "),
        money(e.amount),
      ]),
      note: "Up to eight category/classification groups plus a remainder. All spending remains visible.",
    },
    {
      title: "Customer feedback",
      note: `${analyzed}/${c.sentiment.total} comments analyzed; ${c.sentiment.pending} pending and ${c.sentiment.failed} failed. Percentages use analyzed comments only. Classification is AI-assisted and may be incorrect.`,
      columns: ["Sentiment", "Comments", "Analyzed share"],
      rows: [
        ["Positive", count(c.sentiment.positive), share(c.sentiment.positive)],
        ["Neutral", count(c.sentiment.neutral), share(c.sentiment.neutral)],
        ["Negative", count(c.sentiment.negative), share(c.sentiment.negative)],
        ["Unknown", count(c.sentiment.unknown), "Excluded"],
      ],
    },
    {
      title: "Analyzed feedback topics",
      columns: ["Main topic", "Positive", "Neutral", "Negative"],
      rows: c.feedbackTopics.map((t) => [
        t.topic.replaceAll("_", " "),
        count(t.positive),
        count(t.neutral),
        count(t.negative),
      ]),
      note: "One main topic per analyzed comment; counts do not represent all customers. Raw comments are not included.",
    },
    {
      title: "Saved forecast summaries",
      note: "Latest three saved runs as of report creation, across all dates. These are estimates, not guarantees; later edits do not update them. MAPE is not an accuracy percentage.",
      paragraphs: c.forecasts.length
        ? c.forecasts.map(
            (f) =>
              `${f.metric} / ${f.horizon.replaceAll("_", " ")}: ${formatDate(f.from)} - ${formatDate(f.to)}, total ${formatMoney(f.total, f.currency)}. Training through ${f.trainingEnd}; MAE ${formatMoney(f.mae, f.currency)}; MAPE ${percentage(f.mape)}. Historical gaps: ${f.gapDays}${f.gapsConfirmed ? " (zero activity explicitly confirmed)" : ""}. Saved ${f.createdAt.replace("T", " ").slice(0, 19)} UTC.`,
          )
        : ["No saved forecasts were available when this report was created."],
    },
    {
      title: "Historical alerts",
      note: "Latest five non-dismissed alerts as of report creation, across all dates. Dates can differ from this report. A warning does not prove a condition still holds, and no alerts does not prove healthy performance.",
      paragraphs: c.recentAlerts.length
        ? c.recentAlerts.map(
            (a) =>
              `${a.title} (${a.status.toLowerCase()}): ${a.from} - ${a.to}. ${a.message} Saved ${a.createdAt.replace("T", " ").slice(0, 19)} UTC.`,
          )
        : [
            "No non-dismissed alerts were available when this report was created.",
          ],
    },
    {
      title: "Business observations",
      paragraphs: report.snapshot.observations,
    },
    {
      title: "Coverage and interpretation",
      paragraphs: [
        ...c.warnings,
        "Recorded financial totals use zero where no rows exist; this does not confirm zero activity. Missing historical costs may overstate estimated profit and margin.",
        "This saved report supports business review. It is not audited accounts, tax advice or a guarantee of future results.",
      ],
    },
  ];
  return sections;
}
