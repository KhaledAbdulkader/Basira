import { createHash } from "node:crypto";
import { Decimal as MoneyDecimal } from "@/lib/records/money";
import { businessToday } from "@/lib/records/dates";
import { addDays, type DateRange } from "@/lib/dashboard/period";
import type { Metrics } from "@/lib/dashboard/calculations";
import type { SentimentSummary } from "@/lib/dashboard/service";
import { formatMoney } from "@/lib/dashboard/format";
import {
  ALERT_ENGINE_VERSION,
  ALERT_WINDOW_DAYS,
  MIN_ANALYZED_FEEDBACK,
  RULES,
  type RuleView,
  type RuleEvaluation,
  type AlertEvidence,
  type AlertType,
} from "./contracts";

export function alertPeriod(timezone: string, now: Date) {
  const to = addDays(businessToday(timezone, now), -1);
  return {
    from: addDays(to, 1 - ALERT_WINDOW_DAYS),
    to,
    days: ALERT_WINDOW_DAYS,
  };
}
export type ForecastBasis = {
  id: string;
  horizon: string;
  from: string;
  to: string;
  total: string;
  days: number;
  baselineSum: string;
  baselineDays: number;
  baselineFrom: string;
  baselineTo: string;
  gapsConfirmed: boolean;
};
export type AlertInputs = {
  currency: string;
  timezone: string;
  period: DateRange;
  previousPeriod: DateRange;
  current: Metrics;
  previous: Metrics;
  sentiment: SentimentSummary;
  forecast: ForecastBasis | null;
  now: Date;
};
export type AlertCandidate = {
  ruleId: string;
  type: AlertType;
  title: string;
  message: string;
  fingerprint: string;
  periodFrom: string;
  periodTo: string;
  evidence: AlertEvidence;
};
const Decimal = MoneyDecimal.clone({ precision: 60 });
type ExactDecimal = InstanceType<typeof Decimal>;
const percent = (numerator: ExactDecimal, denominator: ExactDecimal) =>
  numerator
    .times(100)
    .div(denominator)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
export function alertFingerprint(
  type: AlertType,
  from: string,
  to: string,
  horizon = "",
) {
  // Threshold changes, read/dismiss actions and re-generated runs must not spam a period.
  return createHash("sha256")
    .update(`${ALERT_ENGINE_VERSION}:${type}:${from}:${to}:${horizon}`)
    .digest("hex");
}
export function evaluateRules(rules: RuleView[], input: AlertInputs) {
  const evaluations: RuleEvaluation[] = [],
    candidates: AlertCandidate[] = [];
  for (const rule of rules) {
    const evaluation: RuleEvaluation = {
      type: rule.type,
      state: "INSUFFICIENT_DATA",
      explanation: "Not enough data to evaluate this rule.",
      measuredPercent: null,
    };
    evaluations.push(evaluation);
    if (!rule.enabled) {
      evaluation.state = "DISABLED";
      evaluation.explanation =
        "Rule disabled. Existing alerts remain in history.";
      continue;
    }
    const threshold = new Decimal(rule.threshold),
      c = input.current,
      p = input.previous;
    const evidence: AlertEvidence = {
      engine: ALERT_ENGINE_VERSION,
      threshold: threshold.toFixed(),
      measuredPercent: "0",
      currency: input.currency,
      timezone: input.timezone,
      evaluatedAt: input.now.toISOString(),
      currentValue: "0",
      baselineValue: null,
      comparisonFrom: input.previousPeriod.from,
      comparisonTo: input.previousPeriod.to,
      details: [],
      limitations: [],
      forecastId: null,
    };
    let triggered: boolean, message: string;
    let from = input.period.from,
      to = input.period.to,
      horizon = "";
    const money = (value: string) => formatMoney(value, input.currency);
    if (rule.type === "SALES_DROP") {
      if (!c.transactions || !new Decimal(p.revenue).gt(0)) {
        evaluation.explanation =
          "Sales are required in both periods and preceding revenue must be positive. Missing records are not confirmed zero activity.";
        continue;
      }
      const delta = new Decimal(p.revenue).minus(c.revenue),
        baseline = new Decimal(p.revenue);
      evidence.measuredPercent = percent(delta, baseline);
      triggered = delta.times(100).gte(threshold.times(baseline));
      evidence.currentValue = c.revenue;
      evidence.baselineValue = p.revenue;
      message = `Recorded revenue decreased ${evidence.measuredPercent}% (${money(p.revenue)} to ${money(c.revenue)}), meeting the ${rule.threshold}% threshold.`;
      evidence.details = [
        `Current transactions: ${c.transactions}; preceding transactions: ${p.transactions}.`,
      ];
      evidence.limitations = [
        "Comparison uses recorded totals only. Missing transactions or dates can distort the change; confirm both periods are complete.",
      ];
    } else if (rule.type === "EXPENSE_INCREASE") {
      const baseline = new Decimal(p.totalExpenses);
      if (!baseline.gt(0)) {
        evaluation.explanation =
          "Positive recorded expenses are required in the preceding period; a percentage increase from zero is undefined.";
        continue;
      }
      const delta = new Decimal(c.totalExpenses).minus(baseline);
      evidence.measuredPercent = percent(delta, baseline);
      triggered = delta.times(100).gte(threshold.times(baseline));
      evidence.currentValue = c.totalExpenses;
      evidence.baselineValue = p.totalExpenses;
      message = `All recorded expenses increased ${evidence.measuredPercent}% (${money(p.totalExpenses)} to ${money(c.totalExpenses)}), meeting the ${rule.threshold}% threshold.`;
      evidence.details = [
        `Operating: ${money(c.operating)}; inventory purchases: ${money(c.inventory)}; Other: ${money(c.other)}.`,
      ];
      evidence.limitations = [
        "Includes all expense classifications. This spending comparison does not change the estimated-profit formula.",
        "Missing expense records can distort the comparison; verify both periods are complete.",
      ];
    } else if (rule.type === "LOW_PROFIT_MARGIN") {
      if (!new Decimal(c.revenue).gt(0)) {
        evaluation.explanation =
          "Positive recorded revenue is required to calculate a profit margin.";
        continue;
      }
      if (c.costMissing > 0) {
        evaluation.explanation = `Historical costs are missing for ${c.costMissing} sales. This rule waits for complete cost coverage.`;
        continue;
      }
      evidence.measuredPercent = percent(
        new Decimal(c.profit),
        new Decimal(c.revenue),
      );
      triggered = new Decimal(c.profit)
        .times(100)
        .lt(threshold.times(c.revenue));
      evidence.currentValue = c.profit;
      evidence.baselineValue = c.revenue;
      evidence.comparisonFrom = null;
      evidence.comparisonTo = null;
      message = `Estimated profit margin is ${evidence.measuredPercent}%, below ${rule.threshold}% (${money(c.profit)} estimated profit on ${money(c.revenue)} revenue).`;
      evidence.details = [
        `Known historical COGS: ${money(c.cogs)}; operating expenses: ${money(c.operating)}; cost coverage: ${c.costKnown}/${c.transactions} sales.`,
        `Inventory purchases (${money(c.inventory)}) and Other spending (${money(c.other)}) are disclosed separately and excluded from profit.`,
      ];
      evidence.limitations = [
        "Estimated profit = revenue − known historical COGS − operating expenses. Complete cost coverage does not prove all sales and expenses were entered.",
      ];
    } else if (rule.type === "NEGATIVE_FEEDBACK") {
      const analyzed =
        input.sentiment.positive +
        input.sentiment.neutral +
        input.sentiment.negative;
      if (analyzed < MIN_ANALYZED_FEEDBACK) {
        evaluation.explanation = `${analyzed}/${MIN_ANALYZED_FEEDBACK} analyzed comments available. Pending and failed comments do not count toward the minimum.`;
        continue;
      }
      evidence.measuredPercent = percent(
        new Decimal(input.sentiment.negative),
        new Decimal(analyzed),
      );
      triggered = new Decimal(input.sentiment.negative)
        .times(100)
        .gt(threshold.times(analyzed));
      evidence.currentValue = String(input.sentiment.negative);
      evidence.baselineValue = String(analyzed);
      evidence.comparisonFrom = null;
      evidence.comparisonTo = null;
      message = `${input.sentiment.negative} of ${analyzed} analyzed comments (${evidence.measuredPercent}%) are negative, above ${rule.threshold}%.`;
      evidence.details = [
        `Analyzed coverage: ${analyzed}/${input.sentiment.total} comments; ${input.sentiment.unknown} not analyzed.`,
      ];
      evidence.limitations = [
        "This is the share of analyzed comments, not all customers. Sentiment is AI-classified and can be incorrect; review the original feedback.",
      ];
    } else {
      const f = input.forecast;
      if (!f || !new Decimal(f.baselineSum).gt(0)) {
        evaluation.explanation =
          "Generate a fresh revenue forecast using history through yesterday with a positive saved recent baseline.";
        continue;
      }
      const baseline = new Decimal(f.baselineSum).times(f.days),
        predicted = new Decimal(f.total).times(f.baselineDays),
        delta = baseline.minus(predicted);
      evidence.measuredPercent = percent(delta, baseline);
      triggered = delta.times(100).gt(threshold.times(baseline));
      from = f.from;
      to = f.to;
      horizon = f.horizon;
      evidence.currentValue = new Decimal(f.total).div(f.days).toFixed(4);
      evidence.baselineValue = new Decimal(f.baselineSum)
        .div(f.baselineDays)
        .toFixed(4);
      evidence.comparisonFrom = f.baselineFrom;
      evidence.comparisonTo = f.baselineTo;
      evidence.forecastId = f.id;
      message = `Saved forecast revenue per day is ${evidence.measuredPercent}% below its recent daily baseline (${money(evidence.currentValue)} versus ${money(evidence.baselineValue)}), above the ${rule.threshold}% decline threshold.`;
      evidence.details = [
        `Forecast: ${money(f.total)} over ${f.days} days. Saved baseline: ${money(f.baselineSum)} over ${f.baselineDays} days.`,
        `Zero-filled historical gaps were ${f.gapsConfirmed ? "explicitly confirmed" : "not needed"}.`,
      ];
      evidence.limitations = [
        "Forecast estimates are not guaranteed outcomes. This compares saved daily averages, not unequal period totals.",
        "Subsequent record edits do not update a saved forecast. Generate a new forecast to use corrected history.",
      ];
    }
    evidence.limitations.push(
      "Percentages shown are rounded to two decimal places; thresholds use unrounded values.",
    );
    evaluation.measuredPercent = evidence.measuredPercent;
    evaluation.state = triggered ? "TRIGGERED" : "CLEAR";
    evaluation.explanation = triggered
      ? "Threshold met; an alert is saved once for this type and period."
      : "The recorded data does not meet this threshold.";
    if (triggered)
      candidates.push({
        ruleId: rule.id,
        type: rule.type,
        title: RULES[rule.type].label,
        message,
        fingerprint: alertFingerprint(rule.type, from, to, horizon),
        periodFrom: from,
        periodTo: to,
        evidence,
      });
  }
  return { evaluations, candidates };
}
