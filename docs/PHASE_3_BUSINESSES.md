# Phase 3 businesses

Date: 2026-09-27. Scope: business CRUD, switcher, authorization, and business settings only. Phase 4 has not started.

## Delivered

- Business profile schema/migration with eight business types, custom Other text, optional location, ISO currency, IANA timezone, timestamps, and owner index/restriction.
- Business list, creation, settings, overview context, and desktop/mobile switcher with a persistent, server-validated browser preference.
- REST-style business routes, active-user and owner checks in services, exact-origin mutation validation, bounded bodies, and strict writable-field schemas. ADMIN does not bypass ownership.
- Current-version updates and deletion, exact-name destructive confirmation with focus management, helpful conflicts/errors, and empty states.
- Permanent currency/timezone lock once financial history begins. Settings writes and the future financial-write helper share a transaction row lock; a database trigger also protects existing locks.
- Unit, PostgreSQL concurrency/isolation, and browser coverage; CI now runs both authentication and business database suites.

The user explicitly approved locking timezone alongside currency. That decision and stale-edit protection are recorded in [GP1_TO_IMPLEMENTATION_CHANGES.md](GP1_TO_IMPLEMENTATION_CHANGES.md). [BUSINESSES.md](BUSINESSES.md) explains the feature and future financial integration contract.

## Verification

All required local checks passed after the business changes:

| Check                                                              | Result                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `npm run format:check`                                             | Passed                                                                          |
| `npm run lint`                                                     | Passed; no warnings                                                             |
| `npm run typecheck`                                                | Passed                                                                          |
| `npm run test`                                                     | 23 unit/component/API tests passed                                              |
| `npm run test:database`                                            | 16 authentication/business tests passed against PostgreSQL                      |
| `npm run db:validate`                                              | Passed                                                                          |
| `npm run db:check`                                                 | Passed against the development database                                         |
| `npm run test:db`                                                  | Passed connection, transactional writes, exact decimal aggregation, and cleanup |
| `npm run build`                                                    | Passed                                                                          |
| `npm run test:e2e` with `PLAYWRIGHT_CHANNEL=msedge`                | 41 passed; 1 intentional desktop drawer skip                                    |
| Business browser suite after adding deletion focus-trap assertions | All 12 passed across desktop, tablet, and mobile                                |

The migration was applied to both development and isolated test databases. Browser tests use the production build and test database. They verify foreign-ID denial, owner-scoped responses, forged-cookie fallback, complete profile workflows, stale conflicts, locked settings, keyboard focus, and mobile navigation. The protected page shows the not-found UI without another owner's data; the business API returns 404 for foreign IDs. Next.js may return 200 for a page shell already streamed before `notFound()`, as described in its [not-found documentation](https://nextjs.org/docs/app/api-reference/file-conventions/not-found).

Desktop/mobile business lists, light/dark settings, and the mobile deletion dialog were visually reviewed. Temporary preview accounts and businesses were removed from the test database after capture. A test-only ES2024 Promise helper was replaced with an ES2022-compatible helper so checks remain aligned with the project's TypeScript target.

## Boundaries

Only business profiles are stored in Phase 3. No products, sales, expenses, KPIs, imports, forecasts, reports, AI, default expense categories, or alert rules were implemented. Their creation/backfill and whole-business cascade tests belong to their schema phases. Future financial inserts must call `lockFinancialSettings()` within the same transaction before using the business's currency/timezone; the current tests exercise this boundary without inventing financial rows.

Google credentials/live verification remain deferred by the user. No production deployment or remote CI run was performed. Test records use the isolated test database and are cleaned up; development receives schema migrations without demo business seeding.
