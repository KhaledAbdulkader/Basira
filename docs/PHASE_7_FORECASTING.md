# Phase 7 — Forecasting

Implemented on 2026-10-01; final browser verification and documentation on 2026-10-03. Scope: forecasting only. Phase 8 has not started. The product name Basira and the academic title **Intelligent Decision Support System with Predictive Analytics for Small Businesses** remain unchanged.

## Delivered

- Revenue and all-expense forecasts using local Holt linear trend calculations, with Next 7 days, Next 30 days and three full future calendar months.
- A history review with recorded-date minimums, business-local date ranges and explicit confirmation of zero-activity gaps. Missing/current/future observations are never silently used as completed recorded days.
- Training-only parameter selection, chronological backtesting, daily MAE, clearly labeled nonzero-only MAPE, zero exclusions, a last-value baseline and model limitations.
- Atomic ForecastRun/ForecastPoint persistence, stored historical/holdout/daily snapshots, stale-review rejection, duplicate reuse, permanent currency/timezone protection and owner-scoped history/results.
- Responsive historical/forecast charts, accessible exact-value tables, daily/monthly result views and an Overview summary linking to the selected business's latest saved forecast. Saved results retain their own date range independently of dashboard filters.
- Documented algorithm equations, initialization, grid search, coverage, rounding, bridge dates, monthly aggregation, assumptions and evaluation limits in [FORECASTING.md](FORECASTING.md).

## Decisions and boundaries

The user explicitly approved zero-gap confirmation and three full calendar-month totals on 2026-10-01. The history review begins at the first recorded date within the last 366 completed calendar dates and ends yesterday in the business timezone. The implementation conservatively requires 14/60/180 distinct recorded dates; confirmed gaps do not increase eligibility. This refinement was communicated separately from the two user answers and is documented in GP1 implementation change 20.

Next 7/30 days begin tomorrow. Three months begin on the first of next month. Intermediate bridge days are projected but excluded from displayed totals. Monthly values sum daily predictions after currency rounding; charts always compare daily values with daily values. Expenses include Operating, Inventory Purchase and Other spending; this forecasts spending and does not replace the approved profit/COGS calculation.

The service searches 121 alpha/beta combinations using training residuals, reserves the final 7/30/90 days for evaluation, and then fits the final states on all history using the selected parameters. Decimal arithmetic preserves monetary precision. Negative monetary predictions are clamped to zero and disclosed. MAPE omits zero actuals and is unavailable when none are nonzero; it is never presented as an accuracy percentage. A single holdout and a nonseasonal linear model have explicit limitations. Prediction intervals are not implemented; their nullable columns remain null.

Eligibility reads do not write. Generation rechecks the reviewed history under the same business lock used by manual/import/settings mutations, verifies confirmation, computes and saves run/points together. A business/options/version/history identity prevents duplicates. Saved snapshots survive record edits and are deleted only with their owning business. No client-provided model parameters or predictions are trusted. There are no new dependencies, environment variables, external model calls or development demo records.

## Main files

| Files                                                                                        | Purpose                                                                                                   |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib/forecasting/holt.ts`                                                                | Pure Decimal Holt fitting, parameter search, projections, holdout evaluation and errors.                  |
| `src/lib/forecasting/calendar.ts`, `history.ts`                                              | Business-local calendar periods, coverage, history identity and monthly totals.                           |
| `src/lib/forecasting/contracts.ts`, `http.ts`, `service.ts`                                  | Strict inputs, safe HTTP errors, authorized aggregation, locked atomic writes and history/results.        |
| `src/app/api/v1/businesses/[businessId]/forecasts/`                                          | Eligibility, generation, paginated history and detail endpoints.                                          |
| `src/app/(workspace)/forecasts/`, `src/components/forecasting/`                              | Review/confirmation, charts, saved result tables, model explanations and latest-result summary.           |
| `src/app/(workspace)/page.tsx`, `src/components/layout/sidebar.tsx`                          | Overview integration and enabled Forecasts navigation.                                                    |
| `prisma/schema.prisma`, `prisma/migrations/20261001110000_phase_7_forecasting/migration.sql` | Additive models, enums, indexes, numeric/date/count checks, uniqueness and financial-write trigger.       |
| `tests/unit/forecasting.test.ts`, `tests/database/forecasting.test.ts`                       | Numerical/calendar/coverage regressions and real PostgreSQL isolation, storage, rollback and concurrency. |
| `tests/e2e/forecasting.spec.ts`, `tests/helpers/forecasting.ts`                              | Browser journeys and isolated synthetic fixtures.                                                         |

README and the architecture, API, database, deployment, testing, dashboard, core-record and GP1 change documents reflect the implemented scope. The migration is applied to both configured development and test databases.

## Verification

| Check                                                 | Actual result                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                | Passed; all matched files formatted, including this report.                                                                                                      |
| `npm run lint`                                        | Passed, zero warnings, including the Overview summary.                                                                                                           |
| `npm run typecheck`                                   | Passed, including the Overview summary; the production build also checked TypeScript.                                                                            |
| `npm run test`                                        | 87 passed across ten unit/component/API files.                                                                                                                   |
| `npm run test:database` and forecast regression rerun | 61 distinct cases verified: full 60-case suite passed, then the forecasting suite passed all 14 cases after adding the linear bridge-step regression.            |
| `npm run db:validate`                                 | Passed.                                                                                                                                                          |
| `npm run build`                                       | Passed, including the final Overview integration, forecast pages and three API routes.                                                                           |
| Full production browser suite                         | 77 passed, one intentional desktop drawer skip across desktop/tablet/mobile.                                                                                     |
| Final affected browser rerun                          | 18/18 passed after the Overview integration, covering dashboard and forecast journeys in all three viewports.                                                    |
| Migration                                             | Additive Phase 7 migration applied successfully to development and test.                                                                                         |
| Visual review                                         | Desktop light daily result, tablet/mobile dark monthly result and desktop/mobile Overview summaries inspected. Browser assertions check document-width overflow. |

The full browser suite passed before adding the small Overview summary. The final affected rerun covers both dashboard and forecast journeys on all three viewports. Its first invocation on October 1 did not execute because automatic approval review reached a usage limit; it was retried after the user resumed work on October 3. This interruption was not a failed application test.

Tests verify all three horizons and insufficient history, all expense classifications, known and confirmed zeros, current/future exclusion, baseline/MAPE interpretation, tomorrow's bridge step, leap years and month/year boundaries, stale history/date reviews, immutable results, concurrent duplicate requests, injected rollback, owner/admin isolation, permanent locks and cascades. Browser tests also check strict input/origin protection and saved-value navigation after business switching.

Database/browser fixtures use only the isolated test database and clean up their generated users/businesses. No real Google/OpenAI calls are made. Local results do not establish hosted deployment or remote GitHub CI, and live Google OAuth remains deferred until credentials are configured.

## Next phase

Phase 8 is OpenAI customer-feedback analysis: the server-side provider integration, validated structured output, sentiment/topic/summary/confidence, retry/error handling and mock-based tests. It has not started. AI assistant, alerts, reports, administration, hardening and full demo/deployment remain in their approved later phases.
