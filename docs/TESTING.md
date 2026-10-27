# Testing

Phase 14 adds five unit cases for demo/environment boundaries and deterministic history, and two PostgreSQL cases for reserved-account collision, idempotent seed behavior, edit/password preservation, realistic profit/coverage, forecasts, alerts and reports. Tests use the guarded test database and clean only their own records. The local manual demo is a separate development account. See [MANUAL_TESTING.md](MANUAL_TESTING.md) for user acceptance checks and [PHASE_14_DEMO_DEPLOYMENT.md](PHASE_14_DEMO_DEPLOYMENT.md) for release results.

Phase 13 adds thirteen unit cases, one 10,000-record PostgreSQL case, and three browser journeys across all three viewports. The new cases cover hostile column minima and cell references, invalid/truncated UTF-8, interrupted streams, query ambiguity/prototype keys, exact large-history aggregation and pagination, accessibility/contrast, keyboard navigation and HTTP failure retention. The pinned development-only axe tool scans settled pages and dialogs; violations fail and incomplete checks remain attached for review. Timings are observations, not load-test thresholds. See [HARDENING.md](HARDENING.md) and [PHASE_13_HARDENING.md](PHASE_13_HARDENING.md).

Phase 12 adds four unit cases, eleven PostgreSQL cases and three browser journeys across desktop/tablet/mobile. Coverage includes strict queries/status bodies, safe errors, current admin role checks, narrow metadata projections, literal search, paging, status versions, record retention, existing-session suspension/reactivation, concurrent mutual changes and operator-only role provisioning. Browser journeys exercise confirmations/cancel, role-gated navigation, HTTP privacy/CSRF boundaries, demotion/suspension, real pagination, unchanged business selection and responsive light/dark screens. Results are in [PHASE_12_ADMIN.md](PHASE_12_ADMIN.md).

Phase 11 adds nine unit cases, ten PostgreSQL cases and three browser journeys across desktop/tablet/mobile. They cover calendar/custom periods, strict contracts, exact profit and cost coverage, deterministic empty-data summaries, untrusted provider envelopes, real PDF generation, saved-value immutability, concurrent UUID idempotency, active-owner isolation, AI fallback/leases/stale completions, settings locks, history and cascades. Browser checks exercise creation, history/filtering, PDF download/headers, persistence after source changes, missing-provider fallback, business switching, responsive themes and HTTP boundaries. PDF pages are separately rendered for visual review, including Latin/Arabic names and maximum-length labels. Phase 11 results are in [PHASE_11_REPORTS.md](PHASE_11_REPORTS.md).

Phase 10 adds 14 unit cases, 12 PostgreSQL cases and three browser journeys repeated across desktop/tablet/mobile. Coverage includes exact threshold boundaries, missing costs, completed periods, sample minimums, normalized forecast baselines, deduplication under concurrency, immutable evidence, status/version rules, owner/admin isolation, suspension, automatic record/import/analysis/forecast integration, injected rollback and business cascades. Browser tests exercise the notification badge, dashboard summaries, evidence, read/all-read/dismiss, filters, settings, business switching, responsive themes and HTTP boundaries. Results are in [PHASE_10_ALERTS.md](PHASE_10_ALERTS.md).

Phase 9 adds `tests/unit/assistant.test.ts`, `tests/database/assistant.test.ts` and `tests/e2e/assistant.spec.ts`. Coverage includes strict structured replies, canonical refusal, bounded complete-pair history, untrusted envelopes, owner/admin isolation, saved/fresh context, idempotency, leases, stale completion, suspension/deletion during requests, retry-in-place, real message pagination, business cascades and separately dated forecast context. Browser journeys cover dated conversations, missing configuration with draft retention, saved metrics, light/dark layouts, retries, scope, switching and confirmed deletion. Live-provider probes are separate; their timeouts are documented in [the Phase 9 report](PHASE_9_BUSINESS_ASSISTANT.md).

Phase 8 adds `tests/unit/feedback.test.ts`, `tests/database/feedback.test.ts` and `tests/e2e/feedback.spec.ts`. Transport tests cover strict output, enum/range/size/truncation/refusal handling, Arabic input encoding, untrusted instructions, timeouts and safe errors. PostgreSQL tests cover bounded batches, partial failures/retries, provenance, coverage, ownership/suspension, concurrency, edits/deletion during inference and expired leases. Browser tests cover light/dark responsive insights, persisted mock results, missing-provider behavior, edits, scope and HTTP protection. Playwright explicitly clears NVIDIA_API_KEY, so automated checks cannot consume live AI quota. Synthetic live checks are separate and documented in [the Phase 8 report](PHASE_8_FEEDBACK_ANALYSIS.md).

## Current scope

Foundation checks cover configuration, health HTTP behavior, themes, navigation, and PostgreSQL connectivity. Phase 2 adds authentication/security checks; Phase 3 adds business CRUD/switching, ownership, confirmation, and lock/concurrency checks. Phase 4 adds decimal arithmetic, calendar dates, six record workflows, snapshots, composite ownership constraints, daily-count uniqueness, archives, filtering/pagination, and full business cascades. Phase 5 adds exact KPI/profit/growth calculations, inclusive period boundaries, timezone/leap-day/DST cases, null/zero coverage, database aggregation/isolation, responsive charts, filters, and dashboard refresh after record creation. Phase 6 adds CSV/XLSX parsing, upload/expansion limits, matching and row validation, signed previews, atomic import/history writes, idempotent retries, provenance and browser imports. Phase 7 adds deterministic Holt recurrences/fitting, chronological holdout errors, gap confirmation, calendar horizons, stored snapshots, concurrency/atomicity and forecast browser journeys. Phase 8 adds feedback provider, concurrency and UI tests. Phase 9 adds business chat and shared transport regression coverage. Phase 10 adds local alert evaluation, history and controls. Phase 11 adds saved reports, optional summaries and local PDF export. Phase 12 adds restricted administration and account access management. No Google/NVIDIA network calls are made by the automated suite.

## Commands

Before database/browser tests, run `npm run db:migrate:test`. It validates isolation and applies reviewed migrations to `TEST_DATABASE_URL` only. `npm run test:database` runs authentication, business, core-record, dashboard, import, forecasting, feedback, assistant, alert, report and administration PostgreSQL suites; `npm run test:auth:db` runs authentication only; `npm run test` needs no database. Browser tests override the server database to the test URL, generate an independent session secret, and disable live Google and NVIDIA credentials. Never point tests at production. Synthetic users use generated test-only example-domain addresses; cleanup deletes their owned graphs and users by ID. Throttle counters contain no plaintext emails and expire normally.

| Command                | Purpose                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `npm run format:check` | Check formatting without rewriting files                                                     |
| `npm run lint`         | ESLint, TypeScript, Next.js, and React Hooks rules; warnings fail                            |
| `npm run typecheck`    | Generate Next route types, then strict TypeScript without emitting code                      |
| `npm run test`         | Vitest unit/component tests and route-handler integration check                              |
| `npm run test:watch`   | Interactive Vitest watcher                                                                   |
| `npm run db:validate`  | Validate Prisma configuration/schema                                                         |
| `npm run db:check`     | Read-only connection check of the configured development database                            |
| `npm run test:db`      | Real Prisma/PostgreSQL transaction, decimal, and cleanup checks on a dedicated test database |
| `npm run build`        | Generate Prisma Client and compile the production application                                |
| `npm run test:e2e`     | Start the production server on 127.0.0.1:3100 and run Playwright                             |

Run `npm ci` first; its postinstall generates the Prisma client. Run a production build before E2E. Install the browser once with `npx playwright install chromium`. On Linux CI use `npx playwright install --with-deps chromium`.

On this Windows machine, an installed Microsoft Edge can be used without downloading a second browser:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Remove that environment override to use Playwright's downloaded Chromium. Each browser test uses an isolated context; it does not use your personal browser profile. Desktop, tablet, and mobile browser projects cover layout at 1440px, 820px, and Pixel 7 dimensions. The drawer-specific test is intentionally skipped on desktop.

## What the tests assert

- Environment validation accepts PostgreSQL URLs, rejects copied placeholders, and never exposes supplied passwords in errors.
- Integration tests require a separate, deliberately named `_test` database; a shadow database cannot target development under a different host alias.
- The theme button has an accessible name and works with the keyboard.
- The health response is minimal, fresh, and independent of infrastructure secrets.
- Browser tests navigate between working pages, detect browser exceptions and horizontal overflow, verify theme persistence, exercise mobile focus containment/Escape/focus restoration, and check genuine HTTP 404 and basic response headers.
- The live database check uses parameterized/raw tagged Prisma queries and a temporary `numeric(19,4)` table. Exact `0.1 + 0.2 = 0.3000` and automatic table cleanup are verified. No permanent domain tables are created.

No unit test substitutes for an unimplemented feature. The repository's API/feature documentation distinguishes working foundation behavior from later-phase requirements.

## CI and results

`.github/workflows/ci.yml` runs install, format, lint, typecheck, tests, Prisma validation, real database checks, build, and browser tests against a disposable PostgreSQL 18 service. It needs no production secrets. Browser failure artifacts are retained for seven days. A local pass does not prove the remote GitHub job has run; no remote repository has been configured or pushed.

Historical results remain in the Phase 1–13 reports; current results are in [PHASE_14_DEMO_DEPLOYMENT.md](PHASE_14_DEMO_DEPLOYMENT.md). Tests exit nonzero on failure. Database checks fail rather than silently skipping when configuration is unavailable. One drawer test is intentionally skipped only at desktop width. Negative cookie tests intentionally emit the sanitized `JWT_SESSION_ERROR` code.

Phase 5 files: `tests/unit/dashboard.test.ts`, `tests/database/dashboard.test.ts`, and `tests/e2e/dashboard.spec.ts`. The deterministic fixture in `tests/helpers/dashboard.ts` is restricted to the isolated test database workflow; it is not development demo data. No snapshots are hard-coded into the dashboard. The browser suite checks API authentication/ownership/invalid queries, all period presets, a custom single day, missing-data help, exact accessible values, business switching, and chart rendering in three viewports and two themes. Successful visual-review screenshots are generated under ignored `test-results` directories.

Phase 6 adds 29 unit/upload cases, 12 PostgreSQL cases and three browser journeys repeated across three viewports. Parser fixtures cover quoted CSV, encoding/row/column/size limits, all five templates, exact XLSX numeric text, 1900/1904 dates, formula/time rejection, bounded ZIP expansion and unsafe ranges/links. Database fixtures cover every imported model, partial results, missing/zero costs, classification snapshots, idempotency, concurrent daily counts, stale tokens, active-owner checks, injected rollback, scoped foreign keys, cascades and history pagination. Browser journeys exercise reviewed partial CSV sales, XLSX templates/catalog duplicates, history persistence, dashboard updates, origin/ownership protection and stale-confirmation errors. No real uploads are retained by tests.

Phase 7 adds 14 unit cases, 14 PostgreSQL cases and three browser journeys repeated across three viewports. Unit cases independently check Holt updates, constant/linear/zero series, holdout isolation, negative clamping, nonzero-only MAPE, exact monetary rounding, tomorrow's bridge step, timezone/DST/leap-year/month boundaries, recorded-date eligibility and history fingerprints. Database cases cover all horizons, all expense classifications, actual versus assumed zeros, current/future exclusions, stale reviews, immutable snapshots, idempotency/concurrency, owner/admin isolation, rollback, cascade and permanent financial locks. A linear-series regression verifies the bridge step numerically. Browser journeys cover insufficient history, explicit gap acknowledgment/reset, saved values/history/charts, monthly aggregation, business switching and HTTP protection. `tests/helpers/forecasting.ts` creates synthetic records only inside isolated database/browser tests; it does not seed the development application. Successful light/dark desktop/tablet/mobile screenshots are saved under ignored `test-results` folders for visual review.
