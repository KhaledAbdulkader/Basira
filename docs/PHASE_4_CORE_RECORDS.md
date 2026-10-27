# Phase 4 — Core business data

Dates: 2026-09-27–28. Scope: products/services, sales, expense categories, expenses, daily customer metrics, and feedback entry. Phase 5 has not started.

## Delivered implementation

- Six record models, indexes, checks, business-scoped foreign keys, and whole-business cascades in `prisma/schema.prisma` and migration `20260926224819_phase_4_core_records`.
- Default classified expense categories for existing and new businesses; priced catalog/sale/expense writes permanently lock currency and timezone.
- Strict validation, decimal-safe sale totals, historical cost/item-name/classification snapshots, date-only records, and versioned edits/deletion in `src/lib/records` and `src/lib/validation/records.ts`.
- Authenticated business-scoped REST endpoints under `src/app/api/v1/businesses/[businessId]/[resource]`.
- Six protected pages, shared accessible forms/dialogs, filterable paginated tables, archive controls, empty/error states, and enabled navigation in `src/components/records` and `src/app/(workspace)`.
- Unit, PostgreSQL, and browser coverage in `tests/unit/records.test.ts`, `tests/database/records.test.ts`, and `tests/e2e/records.spec.ts`.

Architecture, precision limits, approved transaction/count policies, and future boundaries are explained in [CORE_RECORDS.md](CORE_RECORDS.md) and [GP1_TO_IMPLEMENTATION_CHANGES.md](GP1_TO_IMPLEMENTATION_CHANGES.md).

## Verification

The migration is applied to both development and isolated test databases. Local verification results:

| Check                                                        | Result                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `npm run format:check`                                       | Passed                                                                    |
| `npm run lint`                                               | Passed; no warnings                                                       |
| `npm run typecheck`                                          | Passed                                                                    |
| `npm run test`                                               | 28 unit/component/API tests passed                                        |
| `npm run test:database`                                      | 29 authentication/business/core-record PostgreSQL tests passed            |
| `npm run db:validate`                                        | Passed                                                                    |
| `npm run db:check`                                           | Development connection passed                                             |
| `npm run test:db`                                            | Connection, transactional writes, decimal aggregation, and cleanup passed |
| `npm run build`                                              | Production build passed                                                   |
| Full `npm run test:e2e` with `PLAYWRIGHT_CHANNEL=msedge`     | 50 passed; 1 intentional desktop drawer skip                              |
| Focused core-record browser recheck after mobile refinements | All 9 passed across desktop, tablet, and mobile                           |

Database tests cover cross-business foreign keys, concurrent edits, preserved snapshots, duplicate days/categories, first-financial-write locks, and whole-business cascade deletion. Browser tests cover create/edit/delete workflows, archives, filtering/pagination, historical cost form defaults, duplicate-day errors, focus containment/Escape/restoration, stale conflicts, CSRF, ownership, and suspension. The first full browser run had three failures from an exact-label test locator; changing it to the select's accessible role/name resolved them without weakening the assertions.

Desktop light/dark tables and desktop/mobile product forms were visually reviewed, including the final mobile table layout. Forms scroll within small viewports and tables scroll horizontally; amounts appear earlier in the columns and compact screens show a scroll hint. Synthetic test accounts and records are cleaned up. Phase 4 is complete. The local production preview runs at `http://localhost:3000/products` with the development environment.

## Not included

Dashboard KPIs/charts and customer totals/trends/comparisons are Phase 5. Imports, forecasts, AI feedback analysis, assistant, alerts, reports, admin, and demo seed remain for later phases. Google credentials/live OAuth remain deferred. No deployment or remote CI run is claimed. No demo records are seeded in development; only schema/default categories are added there.
