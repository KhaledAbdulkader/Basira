# Basira deployment guide

Phase 14 prepares the project locally. The user will connect GitHub and hosting later. No repository has been pushed, GitHub-hosted workflow executed, hosted database provisioned, or Vercel deployment created. Local results are in [PHASE_14_DEMO_DEPLOYMENT.md](PHASE_14_DEMO_DEPLOYMENT.md).

The target is one Next.js Node 24 application on Vercel with managed PostgreSQL. Google sign-in and NVIDIA-hosted AI are optional integrations until configured and verified live. GitHub Pages cannot run this server application.

## 1. Verify and publish source

Run from the project folder with separate development/test databases configured:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run db:validate
npm run db:migrate:test
npm run test:database
npm run build
npm run test:e2e
```

Install Chromium once with `npx playwright install chromium`; Linux CI uses `--with-deps`. Windows can use `$env:PLAYWRIGHT_CHANNEL = 'msedge'` before browser tests. Automated browsers use port 3100 and the guarded `_test` database; manual testing uses port 3000. Optional local demo: `npm run db:seed:demo -- --local`. See [DEMO.md](DEMO.md) and [MANUAL_TESTING.md](MANUAL_TESTING.md).

In GitHub Desktop, add this existing local repository, review its files, create the initial commit and publish privately unless you intend to share the source. No remote is configured yet. Verify that `.env*` except `.env.example`, `.local`, `.vercel`, `node_modules`, `.next`, generated Prisma code and test reports remain ignored. Replace keys previously pasted into chat before production use.

The **Basira checks** workflow runs on pushes and pull requests with read-only repository permissions. It installs locked dependencies, checks formatting/lint/types/unit tests, audits runtime dependencies, validates Prisma, provisions disposable PostgreSQL 18 development/test/shadow databases, runs database suites, builds and tests all browser viewports. Credentials are synthetic job-local values. The test migration step deliberately supplies an unusable `DIRECT_URL` to verify that the wrapper replaces it with the test URL. Failed browser artifacts are retained seven days; the job limit is 30 minutes.

Require a green **Basira checks / verify** result before release. A local pass does not establish remote CI success. Vercel promotion is not automatically gated by this workflow: configure deployment checks or keep production promotion manual until CI passes.

## 2. Provision PostgreSQL

1. Create a managed PostgreSQL project, for example in Neon, near the application region. Prefer PostgreSQL 18, matching local and CI verification. The app uses standard PostgreSQL through `pg` and does not require a provider-specific adapter.
2. Create a dedicated production database such as `basira_prod` and a separate staging/preview database or branch. Do not upload local demo credentials or development records into production.
3. Obtain the provider's TLS-enabled pooled runtime and direct migration URLs. Both must target the same project, branch, database and schema. Preserve SSL parameters; use the provider-generated URL or percent-encode reserved password characters.
4. Set `DATABASE_URL` to the runtime connection. Set operator `DIRECT_URL` to the direct endpoint. It is optional when there is no pooler; Prisma falls back to `DATABASE_URL`.
5. To inspect with pgAdmin, register a new server using the provider's host, port, database, user, password and required SSL settings. Keep the local server entry. Connecting does not apply Basira's schema.
6. Enable backups/retention and verify a restore into a separate disposable database before storing important data.

The CLI uses `DIRECT_URL` when supplied, while runtime always uses `DATABASE_URL`, following [Prisma's connection guidance](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections). Validation checks matching database names; it cannot establish that same-named databases on different hosts belong to the same provider branch. Verify that in the provider console.

Each warm instance has a pool of at most five connections, with five-second connection, 30-second idle and ten-second statement timeouts. Five is not a deployment-wide connection limit. `@vercel/functions@3.9.11` attaches the external `pg` pool when `VERCEL=1`, allowing Fluid compute to release idle connections before suspension. Prisma disposal closes the pool too. See [Prisma's Vercel guidance](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-vercel). Check connection capacity under the intended concurrency.

## 3. Configure production variables

| Variable                                   | Scope and purpose                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Vercel Production and operator terminal: production PostgreSQL runtime URL with TLS.    |
| `DIRECT_URL`                               | Operator terminal; optional on Vercel: direct migration endpoint for the same database. |
| `NEXTAUTH_URL`                             | Vercel Production: one canonical HTTPS origin, with no path/query.                      |
| `NEXTAUTH_SECRET`                          | Vercel Production: a fresh independent random secret of at least 32 characters.         |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Vercel Production when ready: configure both web-client credentials together.           |
| `NVIDIA_API_KEY`                           | Vercel Production when ready: current server-side NVIDIA key.                           |
| `NVIDIA_MODEL`                             | `google/gemma-4-31b-it` for feedback analysis and report summaries.                     |
| `NVIDIA_ASSISTANT_MODEL`                   | `nvidia/nemotron-3.5-lightning-30b-a3b` for business conversations.                     |

Do not supply `TEST_DATABASE_URL` or `SHADOW_DATABASE_URL` to production, or prefix secrets with `NEXT_PUBLIC_`. Do not reuse local demo credentials or session secrets. Generate a session secret privately using `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and copy it into the platform secret field. Redeploy after changing variables.

For offline validation, place only intended production settings in ignored `.env.production.local`:

```sh
npm run deploy:check -- --env-file .env.production.local
```

This checks the file in isolation without connecting to services or printing values. It validates URL/TLS shape, a dedicated database name, canonical HTTPS origin, secret length, provider pairs/model and absence of test/shadow values. It does not establish working credentials, migrations, DNS, quota or live authentication.

## 4. Apply migrations

Use a clean operator checkout and terminal with no development `.env` or exported database variables. Keep intended values in an ignored production environment file. Back up an existing database before schema changes. For a new empty database:

```sh
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate status
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate status
```

The first status command can report unapplied migrations. Afterwards all ten checked-in migrations must be applied. `npm run db:deploy` is equivalent if the intended environment is already loaded. Existing process variables take precedence over Node's environment file, so use a clean terminal and verify the destination in the provider console. Never run tests, `migrate dev`, `migrate reset`, `db push` or shadow operations against production.

Builds generate the client and compile the app without migrating a database. Migrations remain a deliberate operator step so preview builds cannot silently alter production. The test migration wrapper overrides both runtime and direct URLs with its guarded test URL. Phase 14 adds no migration.

## 5. Connect Vercel

1. Import the intended repository, use its root and the Next.js preset, and select **Node 24.x**. The engine range and `.node-version` describe the tested baseline; Vercel manages supported minor/patch updates. See [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
2. Use **Install: `npm ci`** and **Build: `npm run build`**, supplied by `vercel.json`. Keep the default Next.js output. This is a Node server deployment, not a static export or Edge-only app.
3. Scope production variables to Production. Give Preview its own database and session secret. Use a stable staging hostname for Google testing rather than sharing production state with arbitrary preview URLs.
4. Select a region near PostgreSQL. Confirm the actual function settings permit the 90-second AI routes and 60-second PDF route. Imports accept 2 MiB/1,000 rows; validate multipart/PDF payloads against Vercel's 4.5 MB request/response limit. Current Fluid Node duration limits permit those budgets; verify the chosen project's configuration using [Vercel function limits](https://vercel.com/docs/functions/limitations).
5. Apply migrations, verify GitHub checks, then deploy/promote the intended commit. Visit its canonical HTTPS hostname and run the smoke checks below.
6. If adding a custom domain, update `NEXTAUTH_URL` and Google's exact callback and redeploy.

PDFs use bundled Noto Sans Latin/Arabic fonts. `next.config.ts` traces these files and externalizes React PDF for Node. Verify a real hosted PDF download; local compilation does not establish bundle/runtime/memory limits. Forecasts and alerts run in bounded server transactions. No background worker or recurring scheduled job is implied.

## 6. Google OAuth production setup

Google credentials remain deferred by the user; password authentication works independently.

1. In Google Cloud choose the project and configure consent/branding/audience information. Add intended test accounts while the audience is in testing.
2. Create an **OAuth client ID → Web application**. Configure the canonical HTTPS origin and exact redirect URI `https://YOUR_HOST/api/auth/callback/google`.
3. Set Vercel's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, keep `NEXTAUTH_URL` on that same origin, and redeploy.
4. Test a new verified Google identity, logout, and returning sign-in. Use a separate staging client/redirect for staging; do not rely on wildcard callbacks.

This project remains on NextAuth v4. See [NextAuth's Google setup](https://next-auth.js.org/providers/google) and [Google's web-client requirements](https://developers.google.com/identity/protocols/oauth2/web-server). Existing password accounts are not automatically linked solely because their email matches Google. Use the original sign-in method; do not enable dangerous account linking to bypass this restriction.

## 7. Approved AI configuration

The original GP1/OpenAI configuration item was replaced by the user's approved **NVIDIA-hosted AI** choice. This implementation has no `OPENAI_API_KEY` or OpenAI fallback. Configure `NVIDIA_API_KEY`, `NVIDIA_MODEL=google/gemma-4-31b-it` for feedback/report summaries, and `NVIDIA_ASSISTANT_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b` for chat server-side. Both model settings default to these values and reject other IDs.

The endpoint is `https://integrate.api.nvidia.com/v1/chat/completions`; see the [official request reference](https://docs.api.nvidia.com/nim/reference/google-gemma-4-31b-it-infer). Check model access and quota in your account; trial access does not promise permanent free production availability.

Run one synthetic feedback analysis, one business question, one unrelated question and one optional report summary in the intended hosted environment. Verify validated outputs, selected-business context and persistence. Calls have a 60-second deadline, bounded concurrency and recovery leases. Earlier Gemma probes timed out; the assistant replacement passed separate local Nemotron checks documented in [ASSISTANT_MODEL_SWITCH.md](ASSISTANT_MODEL_SWITCH.md). Those checks do not establish hosted availability or feedback/report availability. Do not increase limits or bypass validation to hide a timeout. Records, dashboards, local forecasts, alerts and deterministic reports work independently. See [AI_INTEGRATION.md](AI_INTEGRATION.md) and [BUSINESS_ASSISTANT.md](BUSINESS_ASSISTANT.md).

## 8. Administrator and release checks

Register the intended real administrator, choose its email explicitly, then run `npm run admin:grant -- --email "chosen-existing-account@example.com"` in the intended operator environment. It does not create accounts, is never run at deployment and does not promote the demo user. See [ADMINISTRATION.md](ADMINISTRATION.md).

Before declaring a hosted release ready, verify:

- `/api/health` returns 200. This is liveness only, not database/provider readiness.
- Ordinary account registration, login, refresh, logout and unauthenticated rejection.
- Two-business switching, sales/expense calculations and currency/timezone locks.
- Import preview/confirmation, eligible forecasting, alerts, report creation and PDF download.
- A second account cannot access the first account's business, report or PDF URLs.
- Google and AI flows separately after configuration; record blocked checks honestly.
- Admin suspension denies existing-session access without deleting records, using disposable accounts.
- Hosted logs, connection counts, latency and memory meet the expected demonstration load.

Use [MANUAL_TESTING.md](MANUAL_TESTING.md) for step-by-step expected results. Local tests do not establish hosted capacity or uptime.

## 9. Backup and rollback

Enable provider backups or make a pgAdmin custom-format backup before important changes. Store it privately outside the repository. Rehearse restoring to a separate database and verify account/record/report counts there; never overwrite production during rehearsal.

Redeploy the previous known-good application commit only if compatible with the current schema. Do not automatically reverse migrations or reset data. For incompatible changes use a reviewed forward repair, or restore into a new database and intentionally switch both runtime/direct connections. Back up before corrective work and repeat smoke checks. Record the deployed commit, migration status, backup identifier and verification date.

Runtime dependency auditing is part of CI. Four existing high development-only findings in Next ESLint → fast-glob → micromatch → braces were present at Phase 13; see [HARDENING.md](HARDENING.md). Do not force a major downgrade to hide the audit count. Review current advisories before publishing.
