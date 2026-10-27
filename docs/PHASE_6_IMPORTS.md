# Phase 6 — File imports

Completed on 2026-09-30. Scope: CSV/XLSX imports only; Phase 7 has not started. Basira and the academic project title remain unchanged.

## Delivered

- Import workspace for products/services, sales, expenses, daily customer visits and feedback. Header-only CSV/XLSX templates, column guides, upload limits, row previews, errors/warnings, filtering, pagination and explicit confirmation of valid/skipped counts.
- Server-side name matching under the three user-approved policies: one active catalog match for sales, an existing classified expense category, and no product-name overwrite. Existing daily counts require normal edits.
- Exact decimal amounts and historical unit costs, calculated sale totals, expense-classification snapshots, and permanent currency/timezone locking for monetary imports. Missing costs remain unknown and affect the existing dashboard's coverage. Inventory purchases are not deducted twice.
- Signed, expiring previews and confirmation-time revalidation. Valid rows and history commit atomically; unexpected failure rolls back the entire import. Concurrent/repeated confirmation cannot duplicate the exact file.
- Persistent owner-scoped results/history, original counts and skipped-row reasons, and source/import links on all five record types. Normal edits preserve provenance; business deletion cascades through the complete graph.
- Bounded ZIP/XML validation before XLSX loading, strict multipart/CSV handling and sanitized HTTP errors. No raw file retention, macro/formula execution, AI calls, development seed data or automatic currency conversion.

## Main files

| File                                                                                     | Purpose                                                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/imports/parser.ts`, `xlsx-guard.ts`                                             | CSV/XLSX parsing, exact numeric/date normalization, archive/XML and workbook limits.                     |
| `src/lib/imports/validation.ts`, `constants.ts`                                          | Shared record validation, matching policies, column definitions and bounds.                              |
| `src/lib/imports/service.ts`, `token.ts`                                                 | Authorized snapshots, signed previews, locked atomic writes, idempotency and history.                    |
| `src/lib/imports/http.ts`, `templates.ts`                                                | Streaming multipart limits, same-origin checks, safe errors and downloads.                               |
| `src/app/api/v1/businesses/[businessId]/imports/`                                        | Preview/confirm, history/detail and template endpoints.                                                  |
| `src/app/(workspace)/imports/`, `src/components/imports/`                                | Upload/review/result UI, row/history pagination and selected-business context.                           |
| `src/components/layout/sidebar.tsx`                                                      | Enables Imports navigation.                                                                              |
| `prisma/schema.prisma`, `prisma/migrations/20260930090000_phase_6_imports/migration.sql` | DataImport, scoped provenance links, uniqueness/check constraints and indexes.                           |
| `src/lib/records/service.ts`                                                             | Exposes import provenance while preserving it through normal edits.                                      |
| `tests/unit/imports.test.ts`, `tests/unit/import-upload.test.ts`                         | Parser, workbook limits, date/decimal/matching rules, token and multipart tests.                         |
| `tests/database/imports.test.ts`                                                         | Real PostgreSQL snapshots, atomic rollback, concurrency, security, constraints, pagination and cascades. |
| `tests/e2e/imports.spec.ts`, `tests/helpers/imports.ts`                                  | Production browser journeys and bounded synthetic file fixtures.                                         |

README, architecture, database, API, testing, deployment, core-record and academic-change documentation are updated. Detailed contracts and dependency sources are in [IMPORTS.md](IMPORTS.md); GP1 change 19 records the implementation refinements.

## Decisions and limits

Preview rows are transient. An HMAC token binds actor/business/type/file/review and expires after 15 minutes. Confirmation re-uploads the original file, revalidates under the business row lock, and requires the same reviewed result. No mutable staging table or raw-file storage is needed. Both manual mutations and imports use the same business lock and record schemas.

History stores COMPLETED/PARTIAL confirmed outcomes only. Zero-valid/rejected/abandoned uploads create no history. Exact file/type/business hashes prevent duplicate submission, including a renamed file; they cannot detect overlapping records in changed files. The UI instructs users to upload only corrected skipped rows after a partial import. Original history counts survive later record edits/deletions; no separate import undo is provided.

Limits: 2 MiB uploaded files, 1,000 rows, 12 columns, one visible plain worksheet, 4 MiB per expanded ZIP part and 8 MiB total. Oversized ranges, named ranges, merges, data validation, conditional formatting, external links and macros are rejected before workbook allocation. Formula rows are invalid until replaced with values. CSV dates require ISO format; date-formatted Excel values use the workbook's date system and reject time fractions.

Pinned dependencies: Papa Parse 5.7.0, ExcelJS 4.4.0, yauzl 3.4.0, saxes 6.0.0 and their declared typings. ExcelJS is an older stable version with deprecated transitives; its uuid dependency is overridden to compatible 11.1.1 for the published advisory. Read/write fixtures and build validate compatibility; dependency maintenance and hosting load limits need reassessment before deployment.

## Verification

| Check                                       | Actual result                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                      | Passed; all matched files formatted.                                                                                                                                         |
| `npm run lint`                              | Passed, zero warnings.                                                                                                                                                       |
| `npm run typecheck`                         | Passed; production build also completed TypeScript checking.                                                                                                                 |
| `npm run test`                              | 73 passed across nine unit/component/API files.                                                                                                                              |
| `npm run test:database`                     | 47 passed across five real PostgreSQL suites.                                                                                                                                |
| `npm run build`                             | Passed; all import pages/endpoints compiled.                                                                                                                                 |
| Full `npm run test:e2e` plus targeted rerun | 68 verified passes, one intentional desktop drawer skip across desktop/tablet/mobile.                                                                                        |
| Development/test migrations                 | Additive Phase 6 migration applied successfully to both configured databases.                                                                                                |
| Dependency installation audit               | Zero reported vulnerabilities after the scoped uuid override.                                                                                                                |
| Visual review                               | Desktop dark, tablet light and mobile light import previews inspected; browser assertions confirm no document-width overflow. Preview tables scroll within their own region. |

The first unit run had one expected-message mismatch in a test; the first database run omitted the existing explicit deletion confirmation in its cleanup assertion. Both test fixes were followed by passing full suites. The first full browser run had 65 passes, one skip, and three failures at the final duplicate-upload assertion because it also selected Next.js's route announcer. Scoping that selector to main content made all three targeted reruns pass. No application change was required for those browser failures; the same production build was used. No additional broad rerun is claimed.

All database/browser fixtures use only the isolated test database and clean up generated users/businesses. Local checks do not claim remote GitHub CI or hosted deployment. Live Google OAuth remains deferred until the user configures credentials.

## Next phase

Phase 7 is forecasting: Holt's method, backtesting, MAE/MAPE, forecast storage, charts and documentation. No forecasting implementation was started in Phase 6.
