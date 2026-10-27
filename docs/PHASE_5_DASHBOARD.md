# Phase 5 — Dashboard

Implementation date: 2026-09-29. Status: complete and verified. Scope: dashboard only. Phase 6 has not started.

## Delivered

- Overview now shows the selected business's recorded revenue, operating expenses, estimated profit/margin, known cost of sales, revenue growth, customer visits, and average sale value.
- Business-local 7/30/90-day and inclusive custom periods, with immediately preceding equal-length comparisons and useful invalid/empty states.
- Cost coverage for both periods, missing-cost counts, separately disclosed inventory/Other spending, and customer recorded-day coverage. Unknown is not silently treated as a known cost or visit count.
- Recharts financial/customer trends, top revenue and quantity rankings, expense-category breakdowns, and stored feedback sentiment counts. Exact values are also available in accessible tables/lists; light/dark styles and compact layouts are included.
- An authenticated, uncached dashboard GET API using the same service as the server-rendered Overview. Ownership applies to ADMIN actors too.

## Important files

| File                                                                                              | Purpose                                                                                 |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/dashboard/service.ts`                                                                    | Authorized PostgreSQL aggregation and one consistent snapshot for both periods.         |
| `src/lib/dashboard/calculations.ts`                                                               | Pure Decimal KPI, growth, coverage and daily-series calculations.                       |
| `src/lib/dashboard/period.ts`                                                                     | Strict filter validation and business-calendar comparison boundaries.                   |
| `src/lib/dashboard/format.ts`                                                                     | Exact decimal-string money formatting, including large totals.                          |
| `src/app/api/v1/businesses/[businessId]/dashboard/route.ts`                                       | Private GET endpoint, duplicate-filter checks and safe errors.                          |
| `src/app/(workspace)/page.tsx`                                                                    | Overview service integration and invalid-period recovery.                               |
| `src/components/dashboard/`                                                                       | Dashboard, chart components, period form, metric explanations and onboarding.           |
| `src/app/globals.css`                                                                             | Theme-aware chart colors.                                                               |
| `package.json`, `package-lock.json`                                                               | Stable Recharts 3.10.1 and matching react-is 19.3.0.                                    |
| `tests/unit/dashboard.test.ts`, `tests/database/dashboard.test.ts`, `tests/e2e/dashboard.spec.ts` | Calculation/date, PostgreSQL accuracy/isolation and browser workflows.                  |
| `tests/helpers/dashboard.ts`                                                                      | Deterministic test-only business/records fixture.                                       |
| `tests/e2e/auth.spec.ts`                                                                          | Wait for the destination sign-in screen before filling fields shared with registration. |
| `docs/DASHBOARD.md`, `docs/API.md`, `docs/GP1_TO_IMPLEMENTATION_CHANGES.md`                       | Rules, response contract and academic change-log updates.                               |

README, architecture, testing, deployment status and core-record documentation were updated. The Prisma schema and migrations are unchanged.

## Architectural decisions

Use the existing focused `src/lib/<domain>` service structure. Seven parameterized aggregate queries run in a Repeatable Read transaction after current-user/ownership checks. Existing business/date indexes support the scans. At most 366 current chart dates, five product groups per ranking, and eight expense groups plus remainder are returned; individual records/feedback text never reach chart props. No cache invalidation or new tables are needed.

Financial arithmetic stays in PostgreSQL numeric/Prisma Decimal. COGS retains fractional precision until currency formatting; chart coordinates alone convert to numbers. Profit uses historical costs and the saved OPERATING classification. Both inventory and Other remain visible without being deducted twice or silently classified. Money formatting and tooltip values preserve decimal strings. The daily customer chart retains missing gaps; padded financial display dates are not forecast training observations.

Custom dates are limited to 366 days and cannot end after business-local today. The report explicitly distinguishes recorded activity from complete business history. GP1 changes 4, 9, 11 and 16 now reflect delivered KPIs; change 18 records period, coverage, precision, bounded aggregation and missing-data refinements.

## Verification

| Check                              | Actual result                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`             | Passed; all matched files formatted.                                                                                  |
| `npm run lint`                     | Passed with zero warnings.                                                                                            |
| `npm run typecheck`                | Passed after final production build.                                                                                  |
| `npm run test`                     | 44 passed across seven unit/component/API test files.                                                                 |
| `npm run test:database`            | 35 passed across four real PostgreSQL test files.                                                                     |
| `npm run build`                    | Passed; dashboard page and API compile successfully.                                                                  |
| `npm run test:e2e` with local Edge | 59 passed, one intentional desktop drawer skip, across desktop/tablet/mobile.                                         |
| Dependency installation audit      | Zero vulnerabilities reported after adding pinned chart dependencies.                                                 |
| Visual review                      | Desktop/mobile light and dark dashboards and financial charts reviewed; no document-width overflow in browser checks. |

Initial browser runs exposed test selectors that counted legend SVGs as charts and matched hidden navigation content, plus a registration-to-login timing issue in the test. Selectors now target chart wrappers and the visible main region; sign-in waits for its destination heading before filling. The final full run passes without retries. The production build was rerun after the last UI copy changes; all browser checks use that build.

The local development-database preview runs at [localhost:3000](http://localhost:3000/). Browser tests run separately on port 3100 with only the isolated test database. Existing CI automatically includes the new test files; no remote GitHub execution is claimed.

## Boundaries and next phase

No development demo data was added; browser/database fixtures use only the isolated test database and clean up their users/businesses. Google credentials/live sign-in remain deferred at the owner's request. No GitHub remote CI or hosted deployment is claimed.

Phase 6 is CSV/XLSX imports, templates, preview/validation and results/history. Forecasts, AI feedback analysis, assistant, alerts, reports, admin and realistic demo seeding remain in their approved phases. No placeholder prediction or alert data appears on the dashboard.
