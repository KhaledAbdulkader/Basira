# Phase 2 authentication

Date: 2026-09-26. Scope: authentication only; Phase 3 has not started.

## Implemented

- User roles USER/ADMIN, statuses ACTIVE/SUSPENDED, nullable password hashes, and standard provider/adapter models.
- Reviewed migration applied to `basira_dev` and `basira_test`, including email canonicalization constraint, unique provider identities, cascades, and lookup indexes.
- Stable NextAuth v4 Credentials and Google integration with the matching official Prisma adapter; JWT session strategy required by Credentials.
- Accessible registration/sign-in forms, password visibility control, pending/error/status feedback, logout, and protected responsive workspace.
- Asynchronous scrypt hashing, independent salts, timing-safe verification, generic credential/duplicate responses, no privilege assignment through registration, exact-origin registration checks, streamed body bounds, and framework CSRF protection.
- Atomic PostgreSQL attempt counters with HMAC keys and expiry. No new external rate-limit service is required.
- Fresh database role/status checks for sessions, reusable server guards, `/api/me` public-field projection, and denial of existing sessions while a user is suspended.
- Google verified-email checks, safe account-linking defaults, and a disabled/explained button until credentials are configured.
- Unit, database, and browser tests; isolated test migrations/server configuration; CI and setup documentation updates.

## Important files

- `prisma/schema.prisma` and `prisma/migrations/20260926111738_phase_2_authentication/migration.sql`.
- `src/lib/auth`, `src/lib/validation/auth.ts`, `src/lib/http/request.ts`, `src/types/next-auth.d.ts`.
- `src/app/(auth)`, `src/app/api/auth`, `src/app/api/me`, and protected workspace layout.
- `src/components/auth`, `tests/database`, `tests/e2e/auth.spec.ts`, `tests/unit/auth.test.ts`.
- `scripts/migrate-test-database.ts`, `vitest.database.config.ts`, `playwright.config.ts`, and `.github/workflows/ci.yml`.

## Verification

All required local checks passed after the authentication changes:

| Check                                               | Result                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                              | Passed                                                                                                                 |
| `npm run lint`                                      | Passed; no warnings                                                                                                    |
| `npm run typecheck`                                 | Passed                                                                                                                 |
| `npm run test`                                      | 19 passed                                                                                                              |
| `npm run test:auth:db`                              | 8 passed against PostgreSQL                                                                                            |
| `npm run db:validate`                               | Passed                                                                                                                 |
| `npm run db:check`                                  | Passed against development database                                                                                    |
| `npm run test:db`                                   | Passed connection, transaction, decimal aggregation, and cleanup                                                       |
| `npm run build`                                     | Passed                                                                                                                 |
| CI-style Next production build                      | Passed with placeholder auth credentials and an unreachable database; runtime configuration is deferred until requests |
| `npm run test:e2e` with `PLAYWRIGHT_CHANNEL=msedge` | 29 passed; 1 intentional desktop drawer skip                                                                           |

Browser tests ran against the production build on the isolated test database, with desktop/tablet/mobile projects. Sanitized `JWT_SESSION_ERROR` logs are expected in deliberate cookie-tampering tests. Desktop light/dark sign-in and mobile registration screenshots were visually reviewed; fields, controls, and text fit their viewports. Local production preview runs at `http://localhost:3000/login` using the configured development environment.

## Limits and phase boundary

The user explicitly chose to configure Google later. Provider/adapter/policy code is tested, but a real Google consent/code-exchange flow remains unverified. Follow [AUTHENTICATION.md](AUTHENTICATION.md) when credentials are available.

The local session secret is stored only in the ignored `.env`; no default application user/admin or business data was seeded. Register your own account in the UI. A PostgreSQL login is separate from a Basira user. Session guards fail closed when identity cannot be established. An observed suspension does not implement a separate revoke-all-devices/password-change mechanism; those features are not claimed here.

No remote CI run or production deployment was performed. Business CRUD, financial features, AI, reports, account/password settings, email recovery/verification, and the admin panel remain outside this phase. Approved expense classification/cost coverage and currency locking decisions remain documented for the corresponding business/financial phases.
