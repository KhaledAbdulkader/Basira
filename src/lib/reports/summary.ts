import { Decimal } from "@/lib/records/money";
import { formatMoney } from "@/lib/dashboard/format";
import type { AssistantContext } from "@/lib/assistant/context";

export function deterministicSummary(c: AssistantContext) {
  const m = c.current,
    currency = c.business.currency;
  const observations = [
    `Recorded revenue was ${formatMoney(m.revenue, currency)} from ${m.transactions} single-product transactions. All recorded expenses were ${formatMoney(m.totalExpenses, currency)}.`,
    `Estimated profit was ${formatMoney(m.profit, currency)}${m.margin === null ? "; margin is unavailable without revenue" : `, with an estimated margin of ${m.margin}%`}. This deducts known historical COGS and operating expenses only.`,
    `Historical costs cover ${m.costKnown} of ${m.transactions} sales${m.costCoverage === null ? " (not applicable without sales)" : ` (${m.costCoverage}%)`}. Missing costs remain unknown.`,
    `Inventory purchases of ${formatMoney(m.inventory, currency)} and Other spending of ${formatMoney(m.other, currency)} are separately disclosed and excluded from estimated profit.`,
  ];
  const previous = new Decimal(c.previous.revenue);
  if (previous.gt(0)) {
    const change = new Decimal(m.revenue)
      .minus(previous)
      .div(previous)
      .times(100)
      .toFixed(2);
    observations.push(
      `Recorded sales growth was ${change}% versus ${c.comparisonPeriod.from} to ${c.comparisonPeriod.to}. Missing entries can distort this comparison.`,
    );
  } else
    observations.push(
      "Sales growth is unavailable because the preceding period has no positive recorded revenue.",
    );
  observations.push(
    `Recorded customer visits: ${m.visits}, across ${m.customerDays} of ${c.period.days} days. Visits include repeat visits; missing dates are unknown.`,
  );
  const analyzed =
    c.sentiment.positive + c.sentiment.neutral + c.sentiment.negative;
  observations.push(
    `Feedback: ${analyzed} of ${c.sentiment.total} comments analyzed; ${c.sentiment.positive} positive, ${c.sentiment.neutral} neutral and ${c.sentiment.negative} negative. ${c.sentiment.unknown} remain unknown.`,
  );
  return {
    summary: observations.slice(0, 3).join("\n\n"),
    observations: observations.slice(3),
  };
}
