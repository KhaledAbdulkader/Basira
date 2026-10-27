# In-app alerts — Phase 10

Basira checks five configurable rules using local calculations and saved records. Alerts are in-app only: no email, external messaging, scheduler or extra AI calls. A working NVIDIA key is not required. The academic title and existing estimated-profit/currency/timezone policies remain unchanged.

## Evaluation policy

Sales, expense, margin and feedback rules use the latest **30 completed calendar days** in the business timezone, ending yesterday. Sales/expense comparisons use the immediately preceding 30 days. These dates are independent of dashboard filters and conversation dates. The 30-day window and five-comment minimum are implementation defaults communicated during Phase 10; they are not separately confirmed user choices or statistical significance claims.

| Rule                        | Default trigger                                       | Data requirement                                                                                                                                   |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales drop                  | Revenue decreases by **at least 20%**                 | At least one sale in each period and positive preceding revenue. No current sales is unknown, not an automatic 100% decline                        |
| Expense increase            | All recorded expenses increase by **at least 20%**    | Positive preceding expenses. Includes OPERATING, INVENTORY_PURCHASE and OTHER; this does not alter the profit formula                              |
| Low estimated profit margin | Margin is **below 10%**                               | Positive revenue and historical unit costs for every sale in the current period; known zero costs count as covered                                 |
| Negative feedback           | Negative share is **greater than 40%**                | At least **5 analyzed comments**. Denominator includes positive, neutral and negative analyzed comments only; pending/failed coverage is disclosed |
| Forecast revenue drop       | Forecast daily average decreases by **more than 15%** | Latest saved revenue forecast whose training ends yesterday, with a positive saved recent baseline                                                 |

Sales change is `(preceding revenue − current revenue) / preceding revenue × 100`. Expense change reverses that numerator. Margin uses `(revenue − known historical COGS − OPERATING expenses) / revenue × 100`; inventory purchases and Other spending are shown separately and not deducted again. Comparisons use high-precision Decimal cross-products before any display rounding. Percentages shown to users are rounded to two places, so very small boundary differences are explained in the UI.

Recorded totals do not prove completeness. Missing dates/transactions can distort sales/expense alerts; absence of alerts does not mean business performance is healthy. Margin checks are suppressed when cost data is incomplete. A minimum feedback count is a practical guard, not proof of representative sampling; sentiment remains AI-classified and can be wrong. Every rule reports Disabled, Insufficient data, Clear or Triggered with an explanation.

For forecasts, use the latest eligible saved REVENUE run across horizons. Compare its total divided by its forecast calendar-day count with the saved historical total divided by the number of days in the **last up to 30 days of that run's history** (at least 14). Both quantities use saved data. Historical gaps are included only under the forecast's existing explicit zero-gap confirmation. Comparing daily averages avoids treating unequal periods as comparable totals. A run whose history no longer ends yesterday is ineligible for new evaluations; generate a fresh forecast. Existing alerts remain historical. Later record edits do not rewrite saved forecasts or their alert evidence. Forecast estimates are not guarantees.

## Rules and defaults

Five enabled rules are created with each business in its creation transaction. The additive migration backfills the same defaults for existing businesses without changing financial records or creating alerts. Rules are unique by business/type. Owners reach settings from **Alerts → Edit alert settings**, or the business settings page. Thresholds accept up to two decimal places. Bounds are 0.01–100% for sales/forecast drops, 0.01–1000% for expense increases, and 0–100% for margin/negative feedback. Enable/disable and threshold changes use optimistic versions and re-evaluate immediately. There is no rule creation/deletion API in this phase.

## When checks run

- After manual sale, expense or feedback creation/edit/deletion, within the same transaction.
- Once after an import of sales, expenses or feedback commits its rows/history, within that transaction; previews never create alerts.
- After feedback analysis completion, within the short completion transaction; no additional inference is requested.
- After saving a new forecast, within its transaction.
- When the dashboard page/API or alert workspace/list is loaded, and when **Check alerts now** is used.
- After changing a rule.

All participating writes and evaluations serialize on the owned Business row. If alert persistence fails during a record/import/forecast write, that entire write rolls back; clients never receive a false failure after a record has secretly committed. Reads of rules and notification counts are read-only. Direct SQL maintenance is not an application trigger; a subsequent dashboard/alert evaluation checks that data. No work runs after an HTTP response or while the app is idle. Today and future-dated records cannot affect completed-period checks.

## Deduplication and history

A SHA-256 fingerprint uses engine version, rule type and fixed evaluation dates; forecast alerts also include horizon and use forecast dates. Database uniqueness on `(businessId, fingerprint)` prevents duplicates even under concurrent requests. Threshold/version edits, record corrections, repeated imports, regenerated forecasts for the same horizon/dates, page refreshes and read/dismiss actions do not change this identity. Continued conditions may generate one new alert per type on the next completed-day window; that is a new evaluation period.

The first trigger stores an immutable title/message, dates, threshold, measured percentage, comparison values/dates, currency/timezone, explanation, caveats and optional saved forecast ID. All generated alerts have severity WARNING, without an invented risk score. Alert text/evidence remains unchanged if records or rules later change, if a condition clears, or if a rule is disabled. UI labels distinguish historical alerts from current checks. No automatic resolution/reopening is claimed.

Statuses are UNREAD, READ and DISMISSED. **Mark as read** sets readAt; **Mark all as read** affects all currently unread alerts for that business, including those outside visible filters. **Dismiss** sets dismissedAt and removes the alert from dashboard/assistant summaries. Dismissed alerts remain in filtered history and cannot be reopened through this API. Repeating the same status is idempotent; competing changes use versions. Reading/dismissing acknowledges a notification, not resolution of the business condition.

History supports type/status filters and 20-item pages ordered by creation time/ID. The header shows the selected business's unread count. Dashboard summaries show the latest five non-dismissed alerts across all dates. The assistant receives at most five such historical alerts, without IDs or unrestricted access, under prompt version `business-assistant-v2`; saved older conversation snapshots remain intact and render without the new field.

## Authorization and persistence

Every service and route requires a current active owner, including ADMIN. Nested rule/alert IDs are scoped to the business. Mutations require same-origin bounded JSON and strict schemas; clients cannot supply computed evidence, severity, fingerprints or timestamps. No-store responses avoid caching private data. Business switching replaces history and badge state.

Migration `20261009093000_phase_10_alerts` adds AlertRule/Alert and enums. A composite `(businessId, ruleId)` foreign key prevents cross-business references. Constraints validate thresholds, versions, fingerprints, periods, object evidence, nonempty content and status/timestamp consistency. Business deletion cascades through rules and alerts; ordinary rule deletion has no endpoint. No new dependencies or environment variables were added.

API details are in [API.md](API.md), implementation refinements in [GP1_TO_IMPLEMENTATION_CHANGES.md](GP1_TO_IMPLEMENTATION_CHANGES.md), and actual verification in [PHASE_10_ALERTS.md](PHASE_10_ALERTS.md). Production load testing remains a later hardening/deployment task.
