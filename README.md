# Basira

**Business insight, made clear.**

Academic project title: **Intelligent Decision Support System with Predictive Analytics for Small Businesses**.

Basira is a Graduation Project 2 decision-support application for small-business owners and managers. It turns business records into understandable metrics, forecasts, feedback insights, reports, and business advice. It is not an accounting, payroll, tax, inventory-management, or banking system.

## Current status: Phase 14 demo and deployment preparation

Implemented: Next.js App Router, a responsive Basira shell, keyboard-accessible compact navigation, light/dark/system theme support, an About page, loading/error/404 states, a minimal health endpoint, PostgreSQL/Prisma connectivity, strict TypeScript, lint/format tooling, unit/component/API/browser tests, and GitHub Actions configuration.

Phase 2 adds password registration/sign-in, logout, encrypted sessions, protected pages/API, current role/status checks, and Google provider integration. Live Google sign-in awaits your credentials, as requested. Phase 3 adds business profiles, creation/editing/deletion, an owner-checked switcher, and currency/timezone settings. Phase 4 adds manual products/services, sales, classified expense categories, expenses, daily customer-visit counts, and feedback entry, with filters, pagination, historical snapshots, and confirmation before deletion. Phase 5 adds live dashboard KPIs, Recharts trends/breakdowns, 7/30/90-day and custom filters, preceding-period comparisons, and explicit cost/customer-data coverage. Phase 6 adds CSV/XLSX templates, bounded upload parsing, row previews/validation, explicit import confirmation, provenance and results/history for five data types. Phase 7 adds local Holt revenue/expense forecasts, explicit zero-gap confirmation, chronological backtesting, MAE/MAPE, saved snapshots and charts for 7 days, 30 days and three full calendar months. Phase 8 adds NVIDIA-hosted Gemma feedback analysis, bounded retries and sentiment/topic insights. Phase 9 adds dated business conversations, fresh bounded context, saved metric snapshots/history, canonical off-topic refusals and explicit retries. Phase 10 adds five configurable in-app alert rules, automatic local checks, deduplicated historical evidence, read/dismiss actions, filters, dashboard summaries and an unread indicator. Phase 11 adds saved weekly/monthly/custom reports, exact performance summaries, dated forecasts/alerts, optional AI executive summaries, protected history and local PDF export. Phase 12 adds active-admin statistics, searchable user/business directories, confirmed activation/suspension, independent server authorization and explicit operator-only admin provisioning.

Phase 13 strengthens XLSX preflight, UTF-8 body handling and query validation; adds automated accessibility review and a 10,000-record performance regression; and corrects contrast and chart semantics. See [hardening decisions](docs/HARDENING.md) and [verification results](docs/PHASE_13_HARDENING.md).

Phase 14 adds a guarded local demo seed with two fictional businesses, a manual acceptance checklist, production configuration validation, direct migration connections, Vercel pool lifecycle support, CI runtime auditing, and the deployment/backup guide. Hosting remains local by the user's choice; connecting GitHub/Vercel and verifying live Google/AI services are separate operational steps. See [Phase 14 results](docs/PHASE_14_DEMO_DEPLOYMENT.md).

## Try it manually

Open [localhost:3000](http://localhost:3000). For populated charts and forecasts, run `npm run db:seed:demo -- --local` after migrations, then sign in as **demo@basira.example** using the generated password in ignored `.local/demo-access.json`. Keep that file private. The demo user is an ordinary account, not an administrator; an existing account will not automatically see its businesses.

Follow [the manual testing checklist](docs/MANUAL_TESTING.md) for actions and expected results, including a SAR 50 revenue / SAR 20 COGS / SAR 5 operating expenses example. The [demo guide](docs/DEMO.md) explains the data and presentation sequence. Create a separate disposable business for edits/deletions.

## Architecture and technology

One TypeScript application uses Next.js Route Handlers and focused server-side services, backed by standard PostgreSQL through Prisma. Authentication and business ownership checks are implemented; ADMIN does not bypass ownership. The database provider remains replaceable.

- Node 24.13.0, Next.js 16.3.8, React 19.3.0, TypeScript 6.0.3.
- Tailwind 4.3.3, source-owned shadcn-style components, Radix primitives, Lucide, and next-themes.
- Prisma 7.10.0, the standard PostgreSQL adapter and pg, Zod configuration validation.
- Vercel Functions 3.9.11 for hosted database-pool lifecycle management; local PostgreSQL remains supported.
- Recharts 3.10.1 with react-is 19.3.0 for responsive dashboard charts.
- Papa Parse 5.7.0 and ExcelJS 4.4.0 for imports, with yauzl 3.4.0 and saxes 6.0.0 for bounded workbook inspection.
- React PDF 4.9.0 and local Noto Sans/Noto Sans Arabic 5.3.0 for server PDF generation.
- ESLint 10, Prettier, Vitest, React Testing Library, and Playwright.

Stable NextAuth 4.24.15 and Prisma adapter 1.0.7 implement authentication. Password sign-in needs PostgreSQL and the session secret. Google credentials remain optional until enabling that provider; NVIDIA is optional until analyzing feedback or requesting assistant answers or optional report summaries. Exact pins are in package.json and package-lock.json.

## Prerequisites

- Node **24.13.0 or a compatible Node 24 patch** and npm. `.node-version` pins the tested version; `.npmrc` enforces package engines.
- PostgreSQL 18 for live database checks. pgAdmin 4 is supported as the management interface. This computer's server uses **localhost:5433**.
- Git for source control. The project repository is [KhaledAbdulkader/Basira-](https://github.com/KhaledAbdulkader/Basira-).
- Playwright Chromium, or local Microsoft Edge for browser checks.

## Installation and local development

From the project folder:

```sh
npm ci
npm run db:deploy
npm run dev
```

Open [localhost:3000](http://localhost:3000), choose **Create an account**, then sign in. There is no default application login; `basira_local` is a PostgreSQL role, not a Basira user. Use the origin configured in `NEXTAUTH_URL`. Installation generates Prisma Client; run `npm run db:generate` explicitly after changing the schema.

For database checks, follow [the pgAdmin guide](docs/LOCAL_DATABASE_SETUP.md). Copy `.env.example` to `.env` only if a configured `.env` does not already exist. Configure dedicated basira_dev, basira_test, and basira_shadow databases, all owned by basira_local. Keep real secrets in the ignored local environment file.

## Environment variables

| Variable                               | Purpose                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| DATABASE_URL                           | PostgreSQL development/runtime connection                                                                    |
| DIRECT_URL                             | Optional direct endpoint for Prisma migrations; same database as runtime                                     |
| TEST_DATABASE_URL                      | Separate disposable database ending in _test                                                                 |
| SHADOW_DATABASE_URL                    | Separate disposable database for future development migrations                                               |
| NEXTAUTH_URL, NEXTAUTH_SECRET          | Required application origin and random session secret                                                        |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Optional: enable Google sign-in                                                                              |
| NVIDIA_API_KEY, NVIDIA_MODEL           | Server-only feedback analysis, business chat and optional report summaries; Google Gemma 4 31B IT via NVIDIA |

The local session secret is configured. Google setup is in [AUTHENTICATION.md](docs/AUTHENTICATION.md); NVIDIA setup is in [AI_INTEGRATION.md](docs/AI_INTEGRATION.md). Never prefix secrets with NEXT_PUBLIC_. Connection-check errors avoid printing raw database URLs or driver errors.

## Database, migrations, and seed data

```sh
npm run db:generate
npm run db:validate
npm run db:check
npm run test:db
```

The authentication migration creates User, Account, Session, VerificationToken, and AuthThrottle. Phase 3 adds Business and its financial-settings guard. Phase 4 adds six core record tables, composite business-scoped references, financial-write triggers, and default expense categories for existing profiles. Phase 6 adds import history/provenance; Phase 7 adds ForecastRun/ForecastPoint snapshots and constraints; Phase 8 adds feedback analysis metadata; Phase 9 adds ChatConversation/ChatMessage, context snapshots and a separate chat cooldown. Phase 10 adds AlertRule/Alert, scoped constraints and default rules for existing businesses. Phase 11 adds Report snapshots, immutable content and a separate optional summary cooldown. Phase 12 adds account-status versions and directory indexes. All ten migrations are applied locally to development and test. New businesses receive categories and rules in their creation transaction. `npm run db:migrate:test` safely applies migrations to the separate `_test` database before database/browser tests. The live connection check uses a temporary table to verify decimal arithmetic/cleanup.

`npm run db:migrate -- --name <migration-name>` creates development migrations. `npm run db:deploy` applies committed migrations in a deployment. The dedicated shadow database removes the need to grant the local application role permission to create databases. Never use a production database for tests or shadow operations.

Run `npm run db:seed:demo -- --local` to create the two synthetic businesses under a dedicated normal demo owner. The generated password is kept in ignored `.local/demo-access.json`. Reruns preserve existing data and passwords. The command rejects hosted, production and test targets. See [DEMO.md](docs/DEMO.md).

## Quality and tests

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run db:migrate:test
npm run test:database
npm run build
npx playwright install chromium
npm run test:e2e
```

Database checks require the configured .env. Browser tests start a production server on port 3100 with its database explicitly set to the separate test database and a random test session secret. Synthetic accounts are cleaned up by the tests. Leave that port free. On Windows, use existing Edge instead of downloading Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

See [TESTING.md](docs/TESTING.md) for coverage and [the Phase 14 report](docs/PHASE_14_DEMO_DEPLOYMENT.md) for actual results. Alerts require no AI calls. Automated tests mock the AI provider and disable live NVIDIA credentials in browser tests. Live Phase 9 NVIDIA probes timed out at 60 seconds; live reply reliability and semantic quality remain unverified.

## Production build and preview

```sh
npm run build
npm run start
```

The production server defaults to port 3000. If choosing a different port, update `NEXTAUTH_URL` and the Google callback URI to match. GET /api/health returns application liveness only, not database readiness.

## Deployment and CI

The target remains Vercel plus managed PostgreSQL such as Neon, with standard PostgreSQL connections. No deployment has been created. Authentication, Google and NVIDIA setup are documented. GitHub Pages cannot run the required server-side application.

GitHub Actions is configured to install locked dependencies, check format/lint/types/tests, verify PostgreSQL using a disposable service, build, and run browser tests on pushes and pull requests. See [workflow runs](https://github.com/KhaledAbdulkader/Basira-/actions) and [deployment preparation](docs/DEPLOYMENT.md).

## Documentation

- [Architecture and diagram](docs/ARCHITECTURE.md)
- [Target database and ER diagram](docs/DATABASE.md)
- [Implemented API](docs/API.md)
- [Testing](docs/TESTING.md)
- [Local PostgreSQL setup](docs/LOCAL_DATABASE_SETUP.md)
- [Deployment preparation](docs/DEPLOYMENT.md)
- [Demo setup and presentation](docs/DEMO.md)
- [Manual testing checklist](docs/MANUAL_TESTING.md)
- [Phase 14 report](docs/PHASE_14_DEMO_DEPLOYMENT.md)
- [GP1-to-implementation changes](docs/GP1_TO_IMPLEMENTATION_CHANGES.md)
- [Authentication and Google setup](docs/AUTHENTICATION.md)
- [Phase 2 completion report](docs/PHASE_2_AUTHENTICATION.md)
- [Business profiles and settings](docs/BUSINESSES.md)
- [Phase 3 completion report](docs/PHASE_3_BUSINESSES.md)
- [Core records and financial policies](docs/CORE_RECORDS.md)
- [Phase 4 report](docs/PHASE_4_CORE_RECORDS.md)
- [Dashboard definitions and limitations](docs/DASHBOARD.md)
- [Phase 5 report](docs/PHASE_5_DASHBOARD.md)
- [Import formats, matching rules and limits](docs/IMPORTS.md)
- [Phase 6 report](docs/PHASE_6_IMPORTS.md)
- [Forecasting algorithm, coverage and evaluation](docs/FORECASTING.md)
- [Phase 7 report](docs/PHASE_7_FORECASTING.md)
- [AI integration and feedback rules](docs/AI_INTEGRATION.md)
- [Phase 8 report](docs/PHASE_8_FEEDBACK_ANALYSIS.md)
- [Business assistant, context and privacy](docs/BUSINESS_ASSISTANT.md)
- [Phase 9 report](docs/PHASE_9_BUSINESS_ASSISTANT.md)
- [Alert rules, periods and historical evidence](docs/ALERTS.md)
- [Phase 10 report](docs/PHASE_10_ALERTS.md)
- [Saved reports, periods and PDF export](docs/REPORTS.md)
- [Phase 11 report](docs/PHASE_11_REPORTS.md)
- [Administration and first-admin setup](docs/ADMINISTRATION.md)
- [Phase 12 report](docs/PHASE_12_ADMIN.md)
- [Hardening review](docs/HARDENING.md)
- [Phase 13 report](docs/PHASE_13_HARDENING.md)
- [Approved branding](docs/BRANDING.md)
- [Phase 0 review](docs/PHASE_0_REVIEW.md)
- [Phase 1 completion report](docs/PHASE_1_FOUNDATION.md)

Open **Reports** after selecting a business to create a weekly, monthly or custom snapshot and download its PDF. Optional AI summaries can be requested from a saved report. Administration is implemented at `/admin` for active ADMIN accounts. There is no default admin: grant the role only to an explicitly chosen existing account with `npm run admin:grant -- --email "existing-account@example.com"`, then refresh. See [administration setup](docs/ADMINISTRATION.md). All planned implementation phases are covered; production connection and live-provider verification remain pending. Estimated profit, cost coverage, expense classifications and permanent currency/timezone locks remain unchanged; refunds and negative adjustments remain deferred.
