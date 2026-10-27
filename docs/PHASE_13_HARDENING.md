# Phase 13 — Testing and hardening

Implementation and verification: 2026-10-10–11. Product: **Basira**. Academic title: **Intelligent Decision Support System with Predictive Analytics for Small Businesses**. Phase 13 is complete. Phase 14 demo/deployment has not started.

## Delivered

- Closed an XLSX allocation gap by checking both column-range endpoints before loading a workbook. Added safe hostile-range and duplicate/out-of-bounds cell fixtures.
- Rejected malformed/truncated UTF-8 and interrupted request streams with safe errors while preserving existing byte limits; protected cleanup from rejected cancellation promises.
- Made record/import query handling reject ambiguous duplicate parameters and unsupported import filters. Admin/report parsing preserves own keys for strict schema validation.
- Added automated accessibility scans, keyboard and responsive checks across public forms and the main application workflows. Corrected light-theme link/KPI text contrast and named chart group semantics.
- Added an isolated 10,000-sale regression checking exact aggregate totals, bounded dashboard responses, deep pagination, maximum-history forecasting and maximum-row CSV parsing.
- Reviewed authorization across authentication, owner-scoped services, child records, imports, snapshots, AI completion and administration. Existing service and HTTP regression suites cover cross-owner/admin isolation, suspension, forged inputs, stale versions and concurrency.
- Added pinned development-only `@axe-core/playwright@4.13.0`. No runtime dependency, migration, secret, external service, real account role change or demo seed was added.
- Updated architecture, API, branding, testing, deployment and GP1 implementation-change documentation. Review details: [HARDENING.md](HARDENING.md); GP1 refinement 27 records the decisions.

## Verification

| Check                          | Result                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint                           | Passed with zero warnings                                                                                                                                                                                             |
| TypeScript                     | Standalone check and final production build passed                                                                                                                                                                    |
| Unit tests                     | Full suite: 171 passed across 17 files, including thirteen new cases                                                                                                                                                  |
| PostgreSQL tests               | Full suite: 120 passed across twelve files; the new performance case also passed separately to retain measured timings                                                                                                |
| Production build               | Passed with Next.js 16.3.8 after the final contrast correction                                                                                                                                                        |
| Browser tests                  | Final full suite: 128 passed, one intentional desktop drawer skip, across desktop/tablet/mobile in 4.7 minutes                                                                                                        |
| Accessibility                  | All 81 scans across three viewports passed with no violations under the selected rules; keyboard and horizontal-overflow checks passed. Desktop light, tablet dark and mobile dark screenshots were visually reviewed |
| Formatting / Prisma validation | Passed                                                                                                                                                                                                                |
| Dependency audit               | Production-only: zero findings. Full audit: four high development-only findings in one existing braces dependency chain                                                                                               |
| Secret/ignore checks           | No NVIDIA credential pattern in source, tests, docs, public files, example environment or browser chunks; `.env` and local QA artifacts remain ignored                                                                |
| Local preview                  | Restored at localhost:3000; /api/health returned HTTP 200 with {"status":"ok"}                                                                                                                                        |

Initial scans caught missing chart roles and insufficient contrast on small teal links and muted KPI text. These were corrected in shared components/tokens. The scan helper now waits for streamed page content before analyzing it, avoiding checks against loading shells or a document still redirecting. A query test was adjusted to use an unsupported ordinary key at the HTTP boundary: Next.js normalizes some special keys before handlers, while unit tests verify the application's own-key/prototype handling directly. Public form checks cover both themes; workspace checks cover populated and empty workflows, the sale dialog, keyboard skip/Escape/focus behavior and selected dark-theme screens. Automated scans do not certify full WCAG compliance; incomplete axe checks remain attached for manual review.

## Local performance observations

The synthetic database fixture contains 10,000 sales spread over 365 days. Exact revenue was 100,000 and COGS was 30,000; the dashboard returned 365 daily points and page 500 returned exactly 20 sales. Measurements retained on 2026-10-11:

| Operation                                              | Observed time / size |
| ------------------------------------------------------ | -------------------- |
| Dashboard aggregation                                  | 113 ms               |
| Page 500 of sales                                      | 40 ms                |
| Holt evaluation with 366 observations / 90-day holdout | 127 ms               |
| CSV parsing of 1,000 data rows                         | 10 ms                |
| Dashboard JSON                                         | 46,530 bytes         |

These are one local run against an isolated database, not a concurrent load test, production latency promise or hosting-capacity result. Tests assert exact values and bounded payloads rather than machine-specific timing thresholds. All fixture business records are cleaned up; no development demo records were created.

## Remaining limits and next phase

The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still lists no patched version. The four high findings come from the development-only Next ESLint plugin chain; no forced cross-major downgrade or unsupported substitute was applied. The current runtime-only audit is clean, but the full audit is not.

Live Google sign-in remains deferred by the user. The earlier live NVIDIA timeout limitation remains; all automated provider checks use mocks and browser servers clear provider credentials. The first real administrator still requires the user's chosen existing account email. No remote GitHub workflow, hosting deployment, production load test or broader screen-reader certification is claimed. Large catalogs still need capacity review because selectors load the owner's options. Phase 14 remains the final separate demo/deployment phase.
