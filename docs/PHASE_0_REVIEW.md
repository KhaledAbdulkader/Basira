# Phase 0: review and implementation plan

This is the historical planning review. The tested Phase 1 implementation and final dependency decisions are recorded in [PHASE_1_FOUNDATION.md](PHASE_1_FOUNDATION.md) and `package.json`; in particular, the implementation uses supported ESLint 10 rather than the initially proposed ESLint 9.

Review date: 2026-09-25. Scope: read the full supplied specification, inspect the workspace, check dependencies, document the design, and identify decisions. This is not a completed application or a tested dependency installation.

## Inspection and owner decisions

- The workspace was empty, including hidden entries. It was not a Git repository. No source, manifest, lockfile, database schema, environment file, GP1 report, or tests existed.
- No applicable `AGENTS.md` was found in the workspace or its ancestor directories.
- Node `24.13.0`, npm `11.6.2`, and Git are available.
- Docker is installed but its engine was unavailable. The owner subsequently chose their existing pgAdmin 4 workflow, so Docker is not needed for local development.
- The local Windows service `postgresql-x64-18` is running. PostgreSQL 17 and 18 installation directories exist; `psql` is not on PATH. No database login, database creation, or migration was attempted. The server port, dedicated development database, and application role still need local configuration.
- The owner asked us to create a product name and logo. The product is **Basira**, with the tagline **Business insight, made clear.** The original academic title remains unchanged. Branding assets are documented in [BRANDING.md](BRANDING.md).
- The supplied GP2 specification is the design authority. No independent GP1 source material was present to compare beyond the ten stated approved changes.

There is no existing application behavior that conflicts with the specification. Dependency compatibility and ambiguous business meanings are the material risks identified below.

## Recommended architecture

One Next.js App Router application, strict TypeScript, React, Tailwind, selected shadcn components, and a standard PostgreSQL database accessed through Prisma. Versioned Route Handlers invoke small server-side services, with database queries in focused repositories where useful. Authentication, current user status, and business ownership checks run server-side for every protected operation. Admin capabilities are separate from business-content access.

Keep Holt forecasting and financial calculations deterministic. Use OpenAI only through a mockable server-side adapter for structured feedback classification and the business assistant, with optional report summaries. Persist reports as snapshots and produce PDFs locally on the server. See [ARCHITECTURE.md](ARCHITECTURE.md) and [DATABASE.md](DATABASE.md) for diagrams and boundaries.

## Dependency groups and candidate pins

Versions below were checked against public package registry metadata and primary documentation on the review date. They are stable **candidate pins**, not a claim that an installed application passes tests. Install only the packages needed by each phase. Recheck peer dependencies, install with a lockfile, and run checks before marking that phase complete. Never use `--force` or `--legacy-peer-deps` to conceal incompatibilities.

| Group               | Recommended candidates                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/application | Installed Node 24.13.0; `next` 16.3.6; `react` and `react-dom` 19.3.0; TypeScript 6.0.3                                                                                                                                                        |
| Styling/components  | `tailwindcss` and `@tailwindcss/postcss` 4.3.3; `postcss` 8.5.28; shadcn CLI 4.21.0; `lucide-react` 1.48.0; `next-themes` 0.4.6                                                                                                                |
| Database            | Existing PostgreSQL 18; `prisma`, `@prisma/client`, and `@prisma/adapter-pg` 7.10.0; `pg` 8.23.0; `@types/pg` 8.23.1                                                                                                                           |
| Authentication      | `next-auth` 4.24.15; `@next-auth/prisma-adapter` 1.0.7; asynchronous Node `crypto.scrypt` for password hashing with explicit reviewed parameters                                                                                               |
| Validation/forms    | `zod` 4.6.5; `react-hook-form` 7.88.0; `@hookform/resolvers` 5.9.1                                                                                                                                                                             |
| Charts/tables       | `recharts` 3.10.1; matching `react-is` 19.3.0; `@tanstack/react-table` 9.2.4                                                                                                                                                                   |
| File imports        | `papaparse` 5.7.0 and `@types/papaparse` 5.5.2; `exceljs` 4.4.0 provisionally                                                                                                                                                                  |
| AI                  | Official `openai` SDK 7.23.0; Zod structured-output schemas; model selected through configuration                                                                                                                                              |
| PDF                 | `@react-pdf/renderer` 4.9.0, server-side generation from stored snapshots                                                                                                                                                                      |
| Tests               | `vitest` 5.0.2; `vite` 8.3.1; `@vitejs/plugin-react` 6.1.1; `@testing-library/react` 16.3.3; `@testing-library/dom` 10.4.2; `@testing-library/jest-dom` 7.0.1; `@testing-library/user-event` 14.6.7; `jsdom` 29.1.1; `@playwright/test` 1.63.0 |
| Quality/tooling     | ESLint 9.39.5; `eslint-config-next` 16.3.6; Prettier 3.9.9; `dotenv` 18.0.3 and `tsx` 4.23.15 when Prisma/seed scripts require them                                                                                                            |

Supporting type packages and component utilities will be pinned with their dependent packages when installed. Use the generated Prisma Decimal implementation for authoritative money calculations; avoid a second money representation without a reason.

### Compatibility findings

1. The public `prisma` latest tag resolved to `8.0.0-rc.17`; it must not be used under the stable-only requirement. Stable CLI/client/adapter `7.10.0` exist and must match. Prisma 7 uses a driver adapter, an explicit generated client output path, and CLI connection configuration. Consult the versioned documentation during scaffolding rather than copying Prisma 5/6 examples. [Prisma metadata](https://registry.npmjs.org/prisma), [client metadata](https://registry.npmjs.org/@prisma/client), [Prisma 7 guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7).
2. Newest does not always mean mutually compatible: TypeScript 7.0.2 exceeds `typescript-eslint` 8.70.1's `<6.1.0` supported range; ESLint 10.11.0 exceeds the React/accessibility plugins' supported ranges. Use TypeScript 6.0.3 and ESLint 9.39.5 initially. [Next ESLint config](https://registry.npmjs.org/eslint-config-next/16.3.6), [TypeScript ESLint](https://registry.npmjs.org/typescript-eslint/8.70.1), [React plugin](https://registry.npmjs.org/eslint-plugin-react/7.37.5), [accessibility plugin](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2).
3. Latest jsdom 30.1.1 requires a newer Node 24 patch than installed. Version 29.1.1 supports this environment. [Current metadata](https://registry.npmjs.org/jsdom/30.1.1), [selected metadata](https://registry.npmjs.org/jsdom/29.1.1).
4. Tailwind 4 uses its PostCSS package and CSS configuration; shadcn components are copied source, added selectively. TanStack Table 9 requires current v9 API documentation. [Tailwind setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [shadcn compatibility](https://ui.shadcn.com/docs/tailwind-v4), [TanStack installation](https://tanstack.com/table/latest/docs/installation).
5. ExcelJS's latest release remains 4.4.0 from 2023. It is not declared deprecated, but its maintenance age needs review before Phase 6. Retain it provisionally; explain any replacement before changing the stack. [ExcelJS release](https://github.com/exceljs/exceljs/releases/tag/v4.4.0).
6. The OpenAI SDK supports the selected Node/Zod family; the planned Responses flow is `responses.parse` with `zodTextFormat` and validated parsed output. Handle API refusals and incomplete output separately. React PDF supports React 19. [SDK metadata](https://registry.npmjs.org/openai/7.23.0), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [React PDF compatibility](https://react-pdf.org/docs/v4/compatibility).

### Authentication decision

Recommend **stable NextAuth v4.24.15** to honor the requested stack and stable-only rule. The published peers accept Next 16 and React 19; v5 remains `5.0.0-beta.32`. Use v4 documentation and its matching adapter, not v5 `auth()/handlers` examples or a mismatched `@auth/prisma-adapter`. [NextAuth metadata](https://registry.npmjs.org/next-auth/4.24.15), [v4 initialization](https://next-auth.js.org/configuration/initialization), [v4 adapter metadata](https://registry.npmjs.org/@next-auth%2fprisma-adapter/1.0.7).

Credentials requires JWT sessions. Registration explicitly persists password users; the Prisma adapter persists OAuth users/accounts. Use current database status/role checks on protected operations. `Session` and `VerificationToken` remain part of the standard adapter model contract but are unused by the planned JWT/no-email-provider flow. Adapter behavior with Prisma 7 still needs an actual installation and database tests. [Credentials documentation](https://next-auth.js.org/providers/credentials).

Maintenance tradeoff: Auth.js is maintained by the Better Auth team, who continue security/urgent fixes but recommend Better Auth for new projects. This has been disclosed; there is no automatic stack replacement. A future switch needs an explicit design decision and change-log entry. It does not block the foundation. [Maintainer announcement](https://better-auth.com/blog/authjs-joins-better-auth).

## Environment and local database

The placeholder-only [.env.example](../.env.example) contains:

| Variable                                   | Purpose and when needed                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Dedicated PostgreSQL development database/application role; Phase 1 connectivity and migrations |
| `TEST_DATABASE_URL`                        | Separate disposable PostgreSQL database for integration tests                                   |
| `NEXTAUTH_URL`                             | Application origin; localhost initially, production origin at deployment                        |
| `NEXTAUTH_SECRET`                          | Cryptographic session secret for stable NextAuth v4                                             |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Explicit Google provider configuration; live OAuth verification in Phase 2                      |
| `OPENAI_API_KEY`, `OPENAI_MODEL`           | Server-only API key and supported structured-output model; live AI verification in Phases 8–9   |

`NEXTAUTH_SECRET`/`NEXTAUTH_URL` follow the chosen stable v4 documentation; do not mix setup recipes across auth versions. Google callback: `http://localhost:3000/api/auth/callback/google`, and `https://<production-host>/api/auth/callback/google` in production. [NextAuth configuration](https://next-auth.js.org/configuration/options), [Google provider](https://next-auth.js.org/providers/google).

pgAdmin 4 is the owner's database management interface; the application connects directly to PostgreSQL through Prisma. Configure a dedicated development database and least-privilege application role through the existing server. Put real connection details in an ignored local environment file, not in this document or chat. A separate migration URL may be introduced if the eventual hosting provider requires one; no Neon-specific features are needed. Do not modify unrelated existing databases.

## Decisions still needed

Nothing prevents starting the application foundation. Full Phase 1 database verification requires a configured connection to a dedicated development/test database; the running service alone does not prove access. Branding has been delegated to us and the pgAdmin workflow is selected.

Before the affected later feature is implemented, resolve these domain questions with the owner:

- Resolved before Phase 1: currency changes are prohibited after financial records exist (change 12).
- Phase 4/5: whether a sale row represents a complete transaction, a product line, or a daily aggregate; this determines average sale value.
- Resolved before Phase 1: explicit expense classification, inventory exclusion from operating expenses, and cost-data coverage (change 11).
- Phase 7: how users distinguish known zero activity from missing historical records, so forecast eligibility cannot be fabricated by filling gaps.

Remaining open questions and the subsequently approved policies are recorded in [DATABASE.md](DATABASE.md), not approved schema changes. Google credentials, OpenAI model/account access, GitHub repository, and Vercel/production hostname can be supplied when their phases arrive; they do not block Phase 1 scaffolding. No production or API credentials are required for routine automated tests.

## Phase 1 plan and completion gate

1. Initialize local source control, scaffold Next.js App Router and strict TypeScript, and lock verified stable dependencies.
2. Add Tailwind, a small useful set of shadcn components, Lucide, theme support, and an accessible responsive Basira application shell. Do not pretend later dashboard features exist.
3. Configure Prisma for the existing PostgreSQL server, environment validation, client generation, and a dedicated development/test database workflow. Introduce models only as their phases require them; the complete target ERD is already documented.
4. Add ESLint, formatting, Vitest/React Testing Library, and Playwright, with meaningful foundation smoke tests.
5. Add GitHub Actions for locked installation, client generation, lint, typecheck, tests, and production build; use an isolated PostgreSQL service where tests need a database.
6. Provide working run/setup commands and Phase 1 testing documentation. Run lint, TypeScript checks, relevant tests, Prisma validation/connectivity checks, and a production build. Report any unverified external dependency instead of claiming success.

Authentication follows in Phase 2, businesses in Phase 3, core records in Phase 4, dashboard in Phase 5, imports in Phase 6, forecasting in Phase 7, feedback AI in Phase 8, assistant in Phase 9, alerts in Phase 10, reports in Phase 11, admin in Phase 12, hardening in Phase 13, and full deterministic demo/deployment in Phase 14. Add tests with each feature, rather than postponing them all until Phase 13.

## Phase 0 verification and unfinished work

Inspection commands, package metadata, and official documentation support this plan. Documentation links, required entities, ten approved change entries, environment placeholders, and SVG structure receive local sanity checks. No application package has been installed; no database schema exists. Application lint, typecheck, tests, migrations, and build are **not yet available**, so none is reported as passing. All feature implementation remains for the specified phases.
