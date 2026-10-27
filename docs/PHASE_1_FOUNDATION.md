# Phase 1 foundation

Date: 2026-09-25. Scope: foundation only; Phase 2 has not started.

## Approved decisions recorded first

Basira is the approved product name. The academic title remains exactly **Intelligent Decision Support System with Predictive Analytics for Small Businesses**.

Changes 11–12 in `GP1_TO_IMPLEMENTATION_CHANGES.md` record expense classifications (`OPERATING`, `INVENTORY_PURCHASE`, `OTHER`), inventory exclusion from operating expenses, explicit unit-cost coverage, and the currency lock after financial records exist. These are design decisions for the later financial/business phases. Phase 1 does not claim to enforce them without their domain models and services. Change 13 records the approved product identity.

## Implemented

- Next.js App Router, React, strict TypeScript with unchecked-index protection, Tailwind 4, Radix primitives, Lucide, and source-owned shadcn-style components.
- Responsive workspace shell, working Overview/About navigation, persistent themes, keyboard-accessible drawer, loading/error/404 views, reduced-motion handling, and theme-aware branding.
- Honest empty/preview states with no fabricated KPIs or functional-looking links to unimplemented features.
- Minimal uncached `/api/health` liveness route and basic response headers.
- Standard Prisma 7/PostgreSQL adapter with lazy server-only access, a bounded pool, connection/query timeouts, and private environment configuration.
- Model-free schema and generated client: real infrastructure verification without dummy tables or starting User/Business models early.
- ESLint/Prettier, Vitest/React Testing Library, Playwright, GitHub Actions, local source-control initialization, and setup/testing documentation.

## Important files

| Area              | Files                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime and pins  | `package.json`, `package-lock.json`, `.node-version`, `.npmrc`, `next.config.ts`, `tsconfig.json`                                             |
| App shell         | `src/app/(workspace)`, `src/components/layout`, `src/components/ui`, `src/app/globals.css`                                                    |
| Branding          | `src/lib/constants/brand.ts`, `src/components/layout/brand.tsx`, `public/brand`, `docs/BRANDING.md`                                           |
| Database          | `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/db`, `src/lib/validation/environment.ts`, `scripts/check-database.ts`                    |
| Tests and quality | `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `tests`, `.github/workflows/ci.yml`                                          |
| Documentation     | `README.md`, `docs/LOCAL_DATABASE_SETUP.md`, `docs/TESTING.md`, `docs/API.md`, `docs/DEPLOYMENT.md`, updated architecture/database/change log |

## Dependency decisions

Stable application/runtime versions match the verified Phase 0 candidates. Install revealed that ESLint 9.39.5 is now deprecated/unsupported. The foundation instead uses supported ESLint 10.11.0 with `@eslint/js` 10.0.1, `typescript-eslint` 8.70.1, Next's 16.3.6 plugin, and React Hooks 7.1.1 directly. This avoids forcing incompatible React/a11y plugins from the Next preset. TypeScript 6.0.3 stays within TypeScript ESLint's supported range; no peer-dependency bypass flags are used. Accessibility is checked through semantic controls, browser keyboard/focus tests, and visual review rather than claiming the omitted lint plugin ran.

Prisma CLI/client/PostgreSQL adapter remain pinned to stable 7.10.0. Its `latest` CLI tag still points at a release candidate, which was not installed. The generated model-free client works for real PostgreSQL tagged queries.

The initial install reported Prisma CLI transitive advisories. Scoped overrides pin `@prisma/config`'s `deepmerge-ts` to 8.0.2 and Prisma's `mysql2` to 3.24.4. These patch [recursive merge exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) and [MySQL authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)/[compressed-protocol exhaustion](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3). Basira itself uses PostgreSQL. Client generation, configuration/schema validation, real database checks, and build were tested with the overrides. Remove them when a stable Prisma release carries compatible fixes itself; do not use `npm audit fix --force`.

The resolved install reported **zero known npm vulnerabilities**. This is the registry advisory result at verification time, not a guarantee of security.

## Database verification

The owner's PostgreSQL 18 instance is reachable at `localhost:5433`. All three dedicated databases (`basira_dev`, `basira_test`, `basira_shadow`) authenticated successfully as `basira_local`. The private connection URLs were written only to ignored `.env`, and `git check-ignore` confirmed exclusion. `.env.example` contains placeholders only.

The development check is read-only. The test check uses a temporary table in the separate test database to verify transaction execution, exact numeric addition, and automatic cleanup. No permanent domain table, reset, seed, or unrelated database modification was performed. The shadow URL is guarded against using the development or test database name.

## Executed checks

Prettier's formatting check passed. Local documentation links resolved, private environment/generated files were confirmed ignored, and the configured database passwords were absent from checked source, documentation, and browser assets.

| Check                | Result                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- |
| ESLint               | Passed, zero warnings                                                               |
| TypeScript           | Passed, strict checking and Next route types                                        |
| Vitest               | 3 files / 13 tests passed                                                           |
| Prisma schema        | Valid; client generated successfully                                                |
| Development database | Prisma connectivity passed                                                          |
| Test database        | Transaction, exact decimal calculation, and cleanup passed                          |
| Production build     | Passed: `/`, `/about`, and 404 prerendered; `/api/health` dynamic                   |
| Playwright           | 11 passed across desktop/tablet/mobile; 1 intentionally skipped desktop drawer test |
| Visual review        | Desktop light/dark and 390px mobile screenshots inspected                           |

Browser checks used installed Microsoft Edge through Playwright's Chromium engine. The suite does not claim Firefox/WebKit or a full accessibility audit. Vitest initially encountered the Windows sandbox's child-process restriction; it ran successfully with the required process permissions. These were execution-environment limits, not bypassed test failures.

## Limits and next phase

GitHub Actions is configured but has not run remotely. No remote repository or deployment was created. The local preview is public and contains no private data; it must not be mistaken for an authenticated application. Authentication, business switching, CRUD, analytics, imports, forecasts, AI, alerts, reports, admin, and full demo seeding remain unimplemented by design.

The next phase is **Phase 2 — Authentication**: User/adapter models and first migrations, secure registration/password login, Google sign-in, sessions, route/API protection, and current role/status checks. Begin it only after the user's phase review. Sale-record meaning and missing-date coverage remain open decisions before their later feature phases.
