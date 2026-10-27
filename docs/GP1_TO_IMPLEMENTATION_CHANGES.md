# GP1 to implementation changes

Recorded from Phase 0 onward. Changes 1–10 were approved in the supplied GP2 specification; changes 11–13 were approved before Phase 1. **Approved design is not the same as completed implementation.** Each entry identifies what has been implemented and what remains for a later phase.

## 1. Unified application

- Original GP1 approach: Next.js frontend with a separate Node.js/Express backend.
- Implemented approach: full-stack Next.js App Router and Route Handlers. The application shell and liveness route are implemented in Phase 1; domain services remain for later feature phases.
- Reason: reduce architecture and deployment complexity, use one TypeScript codebase, and simplify hosting and maintenance.
- Effect: one application deployment; client/server boundaries remain explicit through services and HTTP endpoints.

## 2. AI provider

- Original GP1 approach: Google AI API.
- Initial GP2 approach: official OpenAI SDK and Responses API. Superseded by the user's Phase 8 NVIDIA/Gemma selection; see change 21.
- Reason: GP2 technology choice for the business assistant and customer-feedback NLP.
- Effect: server-side provider configuration, structured-output schemas, error handling, and mockable integration remain required. Phases 8–9 implement these with NVIDIA for feedback and the business assistant.

## 3. Authentication options

- Original GP1 approach: basic email/password authentication.
- Implemented approach (Phase 2): email/password plus Google OAuth integration. Password flows are verified end to end; live Google sign-in awaits the user’s deferred credential configuration.
- Reason: improve convenience while retaining secure authentication.
- Effect: provider accounts, nullable password hashes for Google-only users, and safe linking behavior.

Phase 2 implementation refinements: use the verified stable NextAuth v4 Credentials/JWT approach and official v4 Prisma adapter; retain Session/VerificationToken as the adapter contract. Add infrastructure-only AuthThrottle counters for shared login/registration limits without an extra service. Canonicalize user emails and enforce that invariant in PostgreSQL. Registration returns the same acceptance message for new/duplicate accounts, and every session reloads current role/status. These implement the approved security requirements without changing the project's business scope. See [AUTHENTICATION.md](AUTHENTICATION.md) for parameters and tradeoffs.

## 4. Customer metrics

- Original GP1 approach: customer numbers were required without a dedicated ERD entity.
- Implemented approach (Phase 4): add CustomerMetric with one daily aggregate visit count per business/date.
- Reason: store aggregate customer counts correctly without customer identities.
- Effect: customer totals and trends can be calculated without collecting customer PII. Phase 5 now displays visit totals, preceding-period comparisons, daily gaps, and recorded-day coverage.

## 5. Forecast persistence

- Original GP1 approach: ForecastResult represented a single forecast record/value.
- Implemented approach (Phase 7): ForecastRun and ForecastPoint, saved atomically with historical/evaluation snapshots and explicitly dated daily or monthly points.
- Reason: a time series contains multiple future points plus model metadata and error metrics.
- Effect: preserve each forecast's training interval, algorithm, horizon, evaluation, and future chart points.

## 6. Alert configuration

- Original GP1 approach: thresholds were referenced without a rule entity.
- Implemented approach (Phase 10): AlertRule and Alert, with enabled defaults for new and existing businesses.
- Reason: users need configurable thresholds and enabled states.
- Effect: separate rule configuration from generated notifications, including duplicate prevention.

## 7. Conversations

- Original GP1 approach: ChatMessage directly stored chat history.
- Implemented approach (Phase 9): ChatConversation and ChatMessage.
- Reason: organize multiple conversations with clearer ownership relationships.
- Effect: conversation history is scoped to both user and business and loaded in bounded windows.

## 8. Forecast algorithm

- Original GP1 approach: forecasting algorithm unspecified.
- Implemented approach (Phase 7): Holt's linear trend method with Decimal arithmetic, bounded parameter search, chronological holdout evaluation and a naive baseline comparison.
- Reason: explainable time-series forecasting without separate machine-learning infrastructure.
- Effect: a local, testable forecasting service with explicit history requirements, backtesting, and documented limitations.

## 9. Estimated profit

- Original GP1 approach: simplified profit calculation.
- Implemented approach: Phase 4 retains nullable historical unit costs; Phase 5 calculates known estimated COGS and approved profit/cost-coverage KPIs.
- Reason: revenue minus operating expenses alone may overstate product-business profit.
- Effect: display **Estimated Profit** and explain missing cost coverage. The approved classification in change 11 resolves inventory/COGS overlap. Implemented in the Phase 5 dashboard service/UI with exact decimal arithmetic and tested zero-denominator states.

## 10. Business timezone

- Original GP1 approach: business timezone not explicitly modeled.
- Implemented approach (Phase 3): add a selectable IANA business timezone, with a browser suggestion at creation and server validation.
- Reason: consistent date boundaries for reporting, imports, analytics, and forecasts.
- Effect: browser-suggested but editable timezone at business creation, with explicit date and timestamp rules.

## 11. Expense classification and cost-data coverage

- Original GP1 approach: a simplified profit figure and expense categories without an explicit distinction between operating costs and inventory purchases.
- Implemented approach: Phase 4 classifies categories as `OPERATING`, `INVENTORY_PURCHASE`, or `OTHER`. Phase 5 Estimated Profit is `Revenue - known historical COGS - Operating Expenses`. Inventory purchases remain visible in recorded spending but are excluded from the operating-expense deduction; do not substitute them for missing unit costs. `OTHER` represents uncategorized treatment and is displayed separately until the owner classifies it, rather than silently assigning an accounting meaning.
- Reason: prevent deducting the same goods both when purchased and when sold, and make incomplete cost information visible.
- Effect: record category classification and preserve its treatment on expense records so later category edits do not silently change historical calculations. Show cost-data coverage (sales with known unit costs / sales in the selected period, including known zero costs), count missing-cost sales, and always label profit as estimated. Disclose excluded `OTHER` spending separately. No sales means coverage is not applicable, not 100%.
- Status: Phase 4 implements nullable historical unit costs, category classification, and expense classification snapshots. Phase 5 implements Estimated Profit, both periods' cost coverage, missing-cost count, and separately disclosed inventory/Other amounts. See [DASHBOARD.md](DASHBOARD.md).

## 12. Protect historical currency

- Original GP1 approach: business currency was stored without an explicit rule for changing it after financial activity.
- Implemented approach (Phases 3–4): permit normal currency changes only while the business has no financial records. Reject changes once sales, expenses, priced catalog entries, or future stored monetary forecasts/reports exist; keep the existing currency when other profile fields are edited. No automatic conversion.
- Reason: changing a currency label does not convert historical amounts.
- Effect: the server must enforce the rule within the same transaction as the update; UI guidance alone is insufficient. Financial writes and currency updates must coordinate on the business row to avoid races. A separate business profile can represent another currency.
- Status: Phase 3 implements guarded settings updates and a permanent marker. Phase 4 catalog, sale, and expense services call the shared row-lock helper transactionally; database insert/update triggers additionally protect ordinary direct writes. Phase 6 monetary imports and Phase 7 forecasts also use this transactional lock; forecast writes additionally have a database trigger. Phase 11 reports now integrate the same helper and database trigger, including empty monetary snapshots.

## 13. Product identity

- Original GP1 approach: the supplied academic title; no original product logo was supplied. GP2 initially used a temporary application name.
- Implemented approach: **Basira**, with the tagline **Business insight, made clear.** Keep **Intelligent Decision Support System with Predictive Analytics for Small Businesses** as the exact academic project title.
- Reason: the project owner requested a product identity and explicitly approved Basira before Phase 1.
- Effect: the interface uses the concise product name while academic documentation retains the full title; no change to project scope.
- Status: vector logo assets created in Phase 0, approved before Phase 1, and used in the responsive application shell. See `docs/BRANDING.md` and `src/components/layout/brand.tsx`.

## 14. Preserve the historical reporting timezone

- Original GP1 approach: timezone was not modeled; the initial GP2 setting did not specify a change restriction after history exists.
- Implemented approach: lock timezone alongside currency after financial records begin, using `financialSettingsLockedAt`.
- Reason: keep historical reporting calendars consistent rather than silently reinterpreting dates.
- Effect: normal profile edits continue, but currency/timezone changes return a conflict after the lock. The marker cannot be cleared by normal API calls or ordinary direct updates. Financial writes and settings changes coordinate on the business row.
- Status: explicitly approved by the user on 2026-09-27; Phase 3 settings enforcement and Phase 4 financial-write integration are implemented and tested. Deleting financial records does not clear the lock.

## 15. Prevent stale business edits and accidental deletion

- Original GP1 approach: business CRUD without an explicit concurrent-edit contract.
- Implemented approach: a positive business `version` required for full-profile updates and deletion; deletion also requires the exact current business name.
- Reason: prevent an old browser tab overwriting newer settings or confirming deletion against outdated details.
- Effect: stale requests return 409 and ask for a reload; ownership and active-account checks apply to every service operation, including ADMIN actors.
- Status: implemented and tested in Phase 3. See [BUSINESSES.md](BUSINESSES.md).

## 16. Define core record meaning and precision

- Original GP1 approach: sales rows and customer counts had no explicit transaction/duplicate-date semantics; numeric precision and rounding were not fixed.
- Implemented approach: one sale is one complete transaction for one product/service. Customer counts are one daily visit total, including repeat visits, with explicit edits for corrections. Refunds/negative adjustments are deferred. Money is transported as decimal strings; numeric(19,4) prices/amounts and numeric(18,3) quantities use validated bounds, exact multiplication, and one half-up rounding to the currency's minor units. Dates use PostgreSQL date and YYYY-MM-DD without browser-offset reinterpretation.
- Reason: prevent ambiguous transaction KPIs, duplicate count inflation, silent rounding, and unintended date shifts.
- Effect: the Phase 5 average-sale-value KPI uses sale-row count under this explicit single-item-transaction scope; customer totals are described as visits rather than unique people. No multi-item receipts/invoicing are introduced. See [CORE_RECORDS.md](CORE_RECORDS.md) for limits/examples.
- Status: transaction/count/refund policies explicitly approved by the user on 2026-09-27; implemented and tested in Phase 4 on September 27–28. Financial KPIs added in Phase 5 on September 29.

## 17. Preserve records and strengthen business isolation

- Original GP1 approach: product/category references and editable records without explicit snapshot/concurrent-edit constraints.
- Implemented approach: sale item-name and unit-cost snapshots, expense-classification snapshots, nullable unknown costs, business-scoped composite foreign keys, and required current versions for edits/deletion. Products are archived; referenced categories cannot be deleted until expenses are reassigned. Business deletion cascades through its whole record graph. New/manual feedback stays UNKNOWN/PENDING and text edits clear stale analysis.
- Reason: retain historical meaning, prevent cross-business references and stale overwrites, and avoid presenting unperformed analysis.
- Effect: catalog/category edits do not recalculate historical sales/expenses. Record APIs reject provenance/analysis/computed-total injection. Nine expense categories are created transactionally for new businesses and backfilled for existing profiles by the Phase 4 migration.
- Status: implemented with unit, PostgreSQL, and browser coverage in Phase 4. Phase 6 now adds import links. Analysis services and later child entities remain for their own phases.

## 18. Define dashboard coverage, periods and bounded aggregation

- Original GP1 approach: dashboards/KPIs without explicit missing-day semantics, comparison boundaries, partial-data presentation, or aggregate consistency rules.
- Implemented approach: inclusive business-local 7/30/90-day and custom periods, immediately preceding equal-length comparisons, and a 366-day custom limit. Missing customer dates remain null; recorded financial totals use zero for absent rows with an explicit activity-coverage caveat. Zero denominators produce Not available. Display both periods' cost/customer coverage, separate inventory/Other spending, and retain Unknown feedback until a completed analysis exists. PostgreSQL aggregates use a consistent authorized transaction; bounded chart payloads carry decimal strings.
- Reason: avoid fabricating observations, overstating confidence, dividing by zero, mixing versions of records across cards, or transferring an unbounded raw history to a browser.
- Effect: no schema change. COGS multiplication/sums retain exact fractional precision until presentation; amounts display with half-up currency rounding. Top-product rankings are limited to five; the top eight category/treatment groups plus a remainder preserve expense totals. Dashboard padding is not approved as forecast training data. Full rules and limitations are recorded in [DASHBOARD.md](DASHBOARD.md).
- Status: implemented in Phase 5; tests cover periods, precision, missing data, historical snapshots, and authorization. These are implementation refinements under the approved dashboard scope, not a new accounting or forecasting capability.

## 19. Define reviewed imports, matching and provenance

- Original GP1 approach: file import and DataImport metadata without precise matching, duplicate, preview consistency, or partial-import semantics.
- Implemented approach: CSV/XLSX templates and previews for five types; sales require one active existing item and expenses an existing classified category, ignoring case/surrounding spaces. Existing or repeated product names are invalid; daily counts cannot replace existing dates. These matching policies were explicitly approved by the user. Signed previews expire after 15 minutes and are revalidated under the business lock before confirmation.
- Reason: prevent ambiguous item matches, accidental updates, stale confirmations, historical-cost substitution, duplicate submissions and unverifiable partial writes.
- Effect: nullable historical sale costs and expense classifications preserve the approved profit rules. Monetary imports permanently lock currency/timezone. The valid subset and COMPLETED/PARTIAL history commit together; failed insert rolls back everything. Exact-file hashes provide scoped idempotency, while identical transaction rows are warned about rather than silently discarded. Changed files are not semantic duplicate detection; retry only corrected skipped rows.
- Schema: DataImport plus business-scoped import links/source on all five importable record types, unique file/type/business identity, counts/status/hash/source constraints and cascade tests. Raw uploads and unconfirmed previews are not retained. Invalid-file/zero-valid attempts do not create history; results retain row numbers/reasons, not a file copy.
- Status: Phase 6 implementation; see [IMPORTS.md](IMPORTS.md) and [PHASE_6_IMPORTS.md](PHASE_6_IMPORTS.md) for limits, dependency tradeoffs and verification. This adds no forecasting, AI calls, refund accounting or automatic currency conversion.

## 20. Define forecast coverage, calendar months and saved evaluation

- Original GP1 approach: time-series forecasting without an algorithm, missing-date policy, precise horizon/calendar definition or reproducible evaluation snapshot. The GP2 specification approved Holt and suggested minimum history of 14/60/180 usable days.
- User-approved clarification (2026-10-01): require explicit confirmation that missing historical dates represent zero activity; display Next 3 months as three full calendar-month totals derived from daily forecasts.
- Implemented approach: review up to 366 completed business-local dates ending yesterday, starting at the first actual record. Minimums count distinct dates with records; confirming zero gaps cannot alone qualify sparse history. This recorded-date rule is a conservative implementation refinement communicated to the user, not a separately answered policy question. Today and future records are excluded. Next 7/30 days start tomorrow; Next 3 months starts on the next calendar month's first day. Model bridge steps are projected but excluded from displayed totals.
- Reason: prevent fabricated observations, incomplete-day training, misleading partial-month totals, evaluation leakage and unreproducible results after historical edits.
- Effect: revenue sums sale totals; expense forecasts include all expense classifications and are labeled spending, not profit. Parameters use a deterministic 121-pair training-only search; final 7/30/90 days form a chronological holdout with MAE, nonzero-only MAPE and a last-value baseline. Refit states on full history with the selected parameters. Clamp negative predictions to zero, round daily amounts to currency precision, and sum them for monthly totals. No prediction intervals or accuracy guarantees are claimed.
- Schema/security: persist typed parameters, errors, currency/timezone, date ranges, data coverage, history/holdout/daily JSON snapshots and ForecastPoint period ends. Decimal(38,4) outputs and Decimal(38,8) errors support daily aggregates with explicit numerical bounds. Recheck reviewed history under the business row lock, enforce active-owner access and permanent financial-setting locks, atomically write points, and reuse identical history/options/version through a unique key. Record edits do not rewrite saved forecasts.
- Status: implemented in Phase 7. Detailed equations, limits and interpretation are in [FORECASTING.md](FORECASTING.md); verification is in [PHASE_7_FORECASTING.md](PHASE_7_FORECASTING.md). These changes add no AI calls, alerts, refund accounting, currency conversion or development demo data.

## 21. Use NVIDIA-hosted Gemma for feedback analysis

- Original GP1 approach: Google AI API; the supplied GP2 specification initially replaced this with the official OpenAI SDK and Responses API.
- User-approved change: the user requested review of NVIDIA's model catalog, supplied a Gemma 4 31B IT API example/key, and explicitly authorized Phase 8 on 2026-10-08.
- Implemented approach: NVIDIA's HTTPS Chat Completions endpoint with `google/gemma-4-31b-it`, native server-side Node fetch, strict JSON Schema requests and independent Zod validation. No OpenAI/Gemini credentials or SDK assumptions are reused.
- Reason: implement the user's selected hosted model without introducing a separate AI service or unnecessary HTTP dependency.
- Effect: use `NVIDIA_API_KEY` and `NVIDIA_MODEL` as server-only variables. The key stays in ignored `.env` locally. Free trial availability, quotas and provider latency are external constraints; there is no free-production guarantee or claim of zero provider retention.
- Status: implemented in Phase 8 and reused for Phase 9 chat through shared server-side transport. Configuration and evidence are in [AI_INTEGRATION.md](AI_INTEGRATION.md), [PHASE_8_FEEDBACK_ANALYSIS.md](PHASE_8_FEEDBACK_ANALYSIS.md) and [PHASE_9_BUSINESS_ASSISTANT.md](PHASE_9_BUSINESS_ASSISTANT.md).

## 22. Define bounded feedback analysis and interpretation

- Original GP1/GP2 approach: sentiment, topics, summaries, confidence and pending/failed states without exact concurrency, topic vocabulary, percentage denominator or retry semantics.
- Implemented approach: explicit user-triggered analysis for manual and imported feedback, three oldest entries per batch, one-minute cooldown, 60-second provider deadlines, 150-second leases and version/token checks. A comment has one dominant topic from ten categories. Summaries are English; source text is preserved. The provider's confidence is labeled classification strength, not measured accuracy.
- Reason: bound API usage, keep partial failures recoverable, prevent stale results after edits/deletion and avoid overstating completeness or precision.
- Effect: additive analysis provenance/attempt/error/lease metadata and a per-business cooldown. Failed calls retain UNKNOWN sentiment and safe error codes. Percentages use analyzed entries only; repeated positive/negative themes count at least two comments in a main topic. Their limitations and all-time scope are visible in the UI. No new customer PII fields, financial calculations, assistant, report or alert scope.
- Status: Phase 8 implementation refinements; documented and tested in the feedback service, provider adapter and new phase report. Edits invalidate the current analysis, while lifetime attempt metadata remains server-side.

## 23. Define dated business conversations and recoverable AI turns

- Original GP1/GP2 approach: locally persisted business chat, controlled context/history and structured scope classification without exact period, snapshot, pagination or retry semantics.
- Implemented approach: conversations belong to the business owner through a composite database reference; reporting dates are fixed at creation. Each question uses the dashboard's exact calculations, selected-period feedback aggregates and the latest three saved forecast summaries. Completed context snapshots are retained; only up to three completed recent pairs are sent back to the provider. Alerts are explicitly unavailable until Phase 10.
- Reason: make answers traceable to saved data, avoid stale-history claims and cross-business access, limit external data exposure, and keep failed or interrupted calls recoverable without duplicate questions.
- Effect: 50 questions per conversation, 20-message pages, 2,000-character questions, bounded context, optimistic versions, idempotent UUID turn IDs, one-minute business cooldown, 60-second request deadline and 150-second claim leases. Latest failed/interrupted answers can be retried in place; completed answers are immutable. Confirmed deletion cascades local messages/snapshots. The exact specified off-topic refusal is enforced in code after validated `inScope: false`; semantic classification remains a model limitation. Estimated-profit and data-coverage caveats are appended from deterministic context.
- Status: Phase 9 implementation refinement within the authorized scope. No later-phase features or new dependencies. [BUSINESS_ASSISTANT.md](BUSINESS_ASSISTANT.md) defines privacy, error handling and limitations; [the Phase 9 report](PHASE_9_BUSINESS_ASSISTANT.md) records automated evidence and live-provider timeouts.

## 24. Define alert evaluation and historical evidence

- Original GP1/GP2 approach: configurable thresholds and notifications without precise evaluation windows, sample guards, unequal-horizon comparisons, history identity or status semantics.
- Implemented approach: 30 completed business-local days compared with the preceding 30, at least five analyzed feedback comments, positive comparison baselines, complete sale-cost coverage for margin checks, and a fresh saved revenue forecast normalized to daily averages against its own last up to 30 history days. The 30-day/five-comment choices are communicated implementation defaults, not separately confirmed user answers or statistical significance claims.
- Reason: prevent incomplete-day, missing-cost and sparse-feedback alerts, comparisons of unequal totals, duplicate notifications and historical rewrites after record corrections.
- Effect: default thresholds retain the specification's 20% sales/expense, 10% margin, 40% negative and 15% forecast levels. Local Decimal comparisons run atomically with relevant writes and on dashboard/alert refresh. Each condition/period has a unique fingerprint and immutable evidence; reading/dismissing does not resolve the underlying condition or reopen the alert. Continued conditions can create one alert per subsequent rolling period. All generated alerts use WARNING severity; no risk score, email, scheduler or extra provider call is introduced.
- Context: assistant prompt version business-assistant-v2 may use the latest five non-dismissed historical alerts with their own dates; older saved conversation snapshots remain intact. This completes the planned recent-alert context without claiming that historical warnings describe the current state.
- Schema/security: AlertRule/Alert, composite business/rule references, bounds/status/version checks, unique fingerprints and owner-scoped controls. The eighth migration backfills five enabled rules and no alerts. Currency/timezone and approved estimated-profit rules are unchanged.
- Status: implemented in Phase 10. See [ALERTS.md](ALERTS.md) for formulas and limitations, and [PHASE_10_ALERTS.md](PHASE_10_ALERTS.md) for verification.

## 25. Define saved reports, calendar periods and optional summaries

- Original GP1/GP2 approach: weekly/monthly/custom reports with persisted values, summaries and PDF export, without exact period, concurrency or provider-failure policies.
- Implemented approach: previous completed Monday–Sunday and calendar month; inclusive custom periods up to 366 days through today. Completed-calendar presets and AI off by default are communicated implementation defaults, not separately confirmed choices.
- The active owner creates a deterministic immutable snapshot first. A business-scoped request UUID makes retries idempotent. Saved names, currency, timezone, dates, exact aggregates, coverage, observations, three dated forecast summaries and five dated historical alerts survive later edits. PDF export uses saved content only.
- Optional NVIDIA executive summaries are requested separately from saved reports, with a strict 1800-character contract, independent cooldown, recoverable leases and safe errors. Missing configuration/provider failure never removes deterministic content or blocks PDF export. Completed AI content/provenance is immutable. No automatic distribution or new live-provider reliability claim is included.
- Schema/security: ninth migration adds Report and its state enums/cooldown, unique request identity, date/JSON/state checks and immutable-content enforcement. Report creation, including an empty monetary snapshot, now integrates the permanent currency/timezone lock with both the shared helper and database trigger. Whole-business deletion cascades reports.
- PDF implementation: local Node rendering with React PDF and bundled Noto Latin/Arabic fonts; no paid service or remote font fetch. Academic title and Basira branding are retained. Estimated profit, expense classification and cost-coverage rules are unchanged.
- Status: implemented in Phase 11. See [REPORTS.md](REPORTS.md) for policy/limits and [PHASE_11_REPORTS.md](PHASE_11_REPORTS.md) for verification.

## 26. Define minimal administration and safe account-status changes

- Original GP1/GP2 approach: simple user activation/suspension, statistics, searchable users and basic business metadata, without granting private business-content access.
- Implemented approach: four platform counts, paginated allowlisted directories, server-enforced active ADMIN checks at page/API/service boundaries, and confirmed status changes with optimistic status versions. No role-editing web API, impersonation, account deletion or access to other owners' private records is added.
- Reason: prevent stale confirmations and concurrent administrator actions from removing every active admin, while keeping the approved administrative privacy boundary explicit.
- Effect: actor/target rows lock in ID order and actor authorization is rechecked after locking. Self-status changes are rejected. Other active admins can manage admin accounts. A tenth migration adds a database-maintained status version and listing indexes; it does not change existing roles/statuses. Status version is concurrency metadata, not an audit log.
- Session policy: suspension blocks subsequent protected requests through current database status; activation permits an unexpired existing session again. Cancellation of already-running requests and permanent token revocation are not claimed.
- Provisioning: an operator-only command grants ADMIN to an explicitly named existing active account, without passwords or default credentials. The intended local account is not guessed. These safeguards and metadata bounds are implementation refinements within Phase 12's authorized scope.
- Status: implemented in Phase 12. [ADMINISTRATION.md](ADMINISTRATION.md) defines behavior and [PHASE_12_ADMIN.md](PHASE_12_ADMIN.md) records verification.

## 27. Strengthen validation and accessibility without changing business rules

- Original approach: bounded plain-sheet imports, strict API schemas and responsive accessible presentation.
- Implemented approach: validate both XLSX column range endpoints before ExcelJS allocation; reject malformed UTF-8, interrupted uploads and ambiguous query filters; correct chart labeling roles and light-theme text contrast.
- Reason: review found an allocation gap in inverted column ranges, inconsistent query handling and measurable accessibility failures.
- Effect: no financial calculation, ownership, historical settings, forecast or provider policy changes. Invalid inputs now fail explicitly. Logo colors remain approved; interaction and muted text colors are slightly darker. Thirteen unit cases, a large-history database case and axe-assisted browser journeys extend regression coverage.
- Status: implemented during Phase 13. See [HARDENING.md](HARDENING.md) for review evidence and [PHASE_13_HARDENING.md](PHASE_13_HARDENING.md) for actual verification. Phase 14 has not started.

## 28. Prepare a local demonstration and separate deployment operations

- Original approach: realistic seed data, CI and production deployment guidance, originally naming OpenAI.
- Implemented approach: an operator-only local seed creates a distinct ordinary owner and two labeled synthetic businesses. A rerun preserves existing data/passwords; identity collisions fail. Feedback stays pending until real analysis. Forecasts, alerts and reports are generated through existing services. No default administrator, fake AI results or automatic database reset is introduced.
- Deployment approach: runtime uses the pooled `DATABASE_URL`; Prisma CLI can use optional `DIRECT_URL` for the same database. Test migration explicitly replaces both values. Builds do not migrate production. A production environment preflight validates configuration shape without printing secrets or contacting services. Vercel Fluid pool lifecycle uses pinned `@vercel/functions@3.9.11`.
- Reason: support an honest repeatable university demonstration, preserve local records and separate reviewed migrations from preview builds. NVIDIA configuration replaces the original OpenAI guide to match the user's previously approved provider. The user explicitly chose to connect GitHub and hosting later.
- Effect: no financial/forecast/ownership-policy changes or schema migrations; optional direct URL and one hosting runtime dependency are added. Full manual testing, CI, PostgreSQL, Google, NVIDIA, backup and rollback instructions are documented.
- Status: implemented locally in Phase 14; verification and outstanding external setup are recorded in [PHASE_14_DEMO_DEPLOYMENT.md](PHASE_14_DEMO_DEPLOYMENT.md). No hosted deployment or remote CI result is claimed.

## 29. Replace the business assistant model after live timeout diagnostics

- Original approach: all hosted AI features used NVIDIA-hosted Google Gemma 4 31B IT.
- Implemented approach: business conversations use NVIDIA-hosted Nemotron 3.5 Lightning (`nvidia/nemotron-3.5-lightning-30b-a3b`) through a separate server-only `NVIDIA_ASSISTANT_MODEL` setting. Feedback and report summaries retain their existing Gemma configuration.
- Reason: Gemma timed out with the normal 60-second adapter deadline and with a minimal 120-second direct probe. The same key/endpoint returned validated Nemotron business and off-topic replies. The user explicitly approved the switch and chose to update the graduation report themselves.
- Effect: no database migration, financial calculation or ownership-policy change. The assistant retains its prompt, strict JSON contract, disabled thinking, response-size limit, 60-second deadline and explicit retry. Saved completed answers keep their original provenance; new/retried answers record the new model. No automatic fallback or resubmission is added.
- Status: implemented after Phase 14. See [AI_INTEGRATION.md](AI_INTEGRATION.md) for configuration and [BUSINESS_ASSISTANT.md](BUSINESS_ASSISTANT.md) for the conversation contract. Live synthetic checks demonstrate compatibility, not measured accuracy or guaranteed provider availability.

## Future changes

Record every meaningful additional GP1 deviation here with the original approach, implemented approach, reason, effect, status, and implementation evidence. Unresolved suggestions in the Phase 0/database review are not approved changes and must not be represented as implemented.
