# Dashboard (Phase 5)

The Overview page and `GET /api/v1/businesses/[businessId]/dashboard` use the same owner-authorized service in `src/lib/dashboard/service.ts`. No schema changes, materialized summaries, demo records, or external API calls are required. The selected business determines currency, timezone, and every query's scope.

## Periods and comparison

The default is Last 30 days. Last 7/30/90 days include today in the business timezone and the preceding 6/29/89 calendar dates. Custom dates are inclusive, at most 366 days, ordered, real YYYY-MM-DD dates, and cannot end after business-local today. The preceding equal-length period ends the day before the current start. The earliest date must leave room for a comparison within the supported year range (1000 onward). Leap days and daylight-saving transitions use calendar-day arithmetic rather than local elapsed hours. Today's records can still be incomplete; the UI says so.

For example, February 22–28 compares with February 15–21. There is no overlap. A one-day selection compares with the previous calendar day. Preset queries reject custom date fields, duplicate query parameters, and unknown fields. The page explains invalid input with a reset link; the API returns 400 instead of falling back to a different period.

## Calculation contract

| Value                      | Definition and missing-data behavior                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revenue                    | Sum of persisted sale `totalAmount`, including zero-value transactions.                                                                                         |
| Known cost of sales / COGS | Sum of `quantity × unitCost` for sales with known historical cost; zero is known, null is unknown. Never use current catalog cost.                              |
| Operating expenses         | Sum of expense amounts with saved classification `OPERATING`.                                                                                                   |
| Estimated profit           | Revenue − known COGS − operating expenses. Can be negative. Always labeled estimated.                                                                           |
| Estimated profit margin    | Estimated profit / revenue × 100; null / Not available when revenue is zero.                                                                                    |
| Sales growth               | (Current revenue − previous revenue) / previous revenue × 100. Zero previous revenue means null / Not available, including when both periods are zero.          |
| Customer visits            | Sum of entered daily visit counts, including repeat visits. No entered days means Not recorded. A recorded zero remains zero.                                   |
| Visit growth               | The same percentage-change formula. Null if either period has no entered customer dates or the previous total is zero. Both periods' day coverage is displayed. |
| Average sale value         | Revenue / sale-row count, under the approved one-complete-single-product-transaction semantics. Null if no transactions.                                        |
| Cost-data coverage         | Sales with non-null historical unit cost / all sales × 100. Missing-cost count is also shown. No sales means Not applicable.                                    |

Inventory purchases and `OTHER` spending are excluded from profit and disclosed with their amounts. They are included in **All expenses**, expense charts, and category breakdowns. Neither substitutes for unknown costs. Expense category edits do not recalculate saved expense classifications. Missing unit costs can overstate profit; cost coverage for both periods is shown next to the calculation explanation. Coverage is transaction-count based, not revenue weighted.

PostgreSQL numeric multiplication/sums and Prisma Decimal (40 significant digits) perform authoritative calculations. Money crosses the API as decimal strings. COGS preserves fractional quantity × cost precision; it is not rounded per sale. Period profit uses those unrounded sums. Presentation rounds half-up to currency minor units; percentages round to two decimals. Rounded daily values can consequently differ slightly from a rounded period total. Average-sale division uses the Decimal context's precision. Formatting never converts money through a JavaScript Number, including large totals. Recharts receives numeric coordinates only; money tooltips and textual values use the original exact decimal strings. Chart axes are intentionally compact approximations.

## Trends, breakdowns and empty states

- Financial trends show daily recorded revenue, **all** expenses, and estimated profit. Missing financial dates have a recorded total of zero with an explicit explanation: absence of records is not proof of zero business activity. These padded display series must not be treated as usable forecasting observations.
- Customer trends retain null gaps and do not connect across missing days. Both explicit zero and missing entries are available in the daily data table.
- Top-five product/service revenue and quantity rankings include archived products and group by product ID plus historical item name. A renamed item may appear under multiple historical names. Unlinked sales have their own group. Top revenue is not an exhaustive allocation; all product revenue remains in the main KPI. Quantity rankings can involve different units, as disclosed in the UI.
- Expense breakdowns use current category names with saved classification. The top eight groups are shown; any remaining amount is included as Additional categories, preserving the full spending total. A category whose treatment changed can appear once per historical classification.
- Sentiment counts use completed analyses only. PENDING, FAILED, or ANALYZED/UNKNOWN entries are Unknown. Total, pending and failed counts are explicit. No analysis is performed in this phase; newly entered feedback stays Unknown.
- No business shows the onboarding action. An empty selected period has a records/date hint. Each empty chart offers the relevant record-entry action rather than generating sample data.
- Charts use Recharts with responsive containers, non-animated lines/bars, distinct financial line styles, theme-aware colors, and accessible values in tables/lists. Every financial/customer date is available in the expandable, keyboard-focusable data table. Metric help uses keyboard-operable disclosure controls.

## Architecture and limits

The service checks an active actor and ownership, including for ADMIN actors, inside a PostgreSQL Repeatable Read transaction. Seven bound-parameter aggregate queries read one consistent snapshot. Existing business/date indexes support both period scans. Daily output is bounded to 366 current dates and at most 732 input dates; product/category output is bounded independently. Raw sale rows and feedback text never reach the browser. There is no stored aggregate cache to invalidate after record changes. Reloading/navigating to Overview reads fresh data; the API sends `Cache-Control: no-store`.

The same focused `src/lib/<domain>` service structure used in earlier phases is retained; no duplicate repository framework is introduced. Chart code is a client component; authorization, aggregation, and profit logic stay outside React. `period.ts`, `calculations.ts`, and `format.ts` contain deterministic logic for direct tests.

Installed stable dependencies: Recharts 3.10.1 and react-is 19.3.0, matching React 19.3.0. Registry peer compatibility and the lockfile were checked. Primary references: [Recharts installation](https://recharts.github.io/en-US/guide/installation/), [responsive containers](https://recharts.github.io/en-US/api/ResponsiveContainer/).

Phase 6 imported records feed these same dashboard calculations. Phase 7 forecasts independently review recorded history and require explicit confirmation before treating missing dates as zero; dashboard padding is never reused as training data. Overview also shows the selected business's latest saved forecast total, metric, horizon, generation time and date range, with a link to its result. This snapshot is independent of the dashboard date filter and never refreshes itself from later record edits. Businesses without forecasts see an actionable empty state. The dashboard KPI API is unchanged. Alerts, AI feedback analysis, reports, admin screens, and realistic development demo seeding remain in their approved later phases. There are no fabricated predictions/alerts or live AI calls. This phase does not address refunds, multi-item receipts, unique-customer tracking, full accounting, or currency conversion.

See [API.md](API.md), [TESTING.md](TESTING.md), and [PHASE_5_DASHBOARD.md](PHASE_5_DASHBOARD.md) for validation results.
