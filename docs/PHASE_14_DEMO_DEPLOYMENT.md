# Phase 14 — Demo and deployment preparation

Implementation and verification: 2026-10-11–12. Product: **Basira**. Academic title: **Intelligent Decision Support System with Predictive Analytics for Small Businesses**. The user requested local preparation and will connect hosting later. Phase 14 local implementation and verification are complete; no hosted deployment is claimed.

## Delivered

- Local demo command with a random password stored privately in ignored `.local/demo-access.json`. A dedicated ordinary owner has a 210-day cafe and a 21-day service business, with clearly labeled synthetic data. All inserts share one transaction; reruns preserve edits/passwords and an account-identity collision fails.
- Exact transaction-level sales with some unknown historical costs, classified operating/inventory/other expenses, explicit daily visits and pending multilingual feedback. No fabricated AI, imported-file provenance, report, forecast or administrator result.
- Full manual acceptance checklist with expected outcomes, exact profit example, imports, provider-dependent checks, forecasts, alerts, PDF snapshots, account isolation, keyboard/mobile behavior and bug-report format.
- Optional direct migration URL and isolated test migration override; production environment shape checker; Vercel build configuration; `@vercel/functions@3.9.11` for hosted pool lifecycle and external-pool disposal.
- Updated GitHub Actions with runtime auditing, test migration isolation verification and a 30-minute budget. Deployment guide covers production PostgreSQL/TLS, reviewed migrations, environment separation, Google OAuth, NVIDIA Gemma, first-admin provisioning, release checks, backups and rollback. No schema migration is added.

## Verification

| Check                                  | Result                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ESLint                                 | Passed, zero warnings                                                                                 |
| TypeScript                             | Passed                                                                                                |
| Unit/component/API suite               | 176 passed across 18 files                                                                            |
| PostgreSQL suite                       | 122 passed across 13 files                                                                            |
| Production build                       | Passed                                                                                                |
| Browser regression                     | 128 passed, one intentional desktop-only skip; 6.3 minutes                                            |
| Prisma schema/test migration isolation | Passed; ten migrations present, none pending; unrelated direct URL overridden                         |
| Runtime audit                          | Zero findings; full audit retains four existing high development-only findings                        |
| Formatting                             | Passed                                                                                                |
| Actual local demo smoke                | Passed: password login, populated cafe charts, forecast page, studio switching; no browser exceptions |

The demo was created through **2026-10-11**. A separate headless browser verified it against the actual local production preview, without changing the user's browser or calling an AI provider. Unit/database/browser suites use isolated data, not the local demo account. Logs and screenshots are in ignored `.local/phase14-*` and browser output folders.

The CLI production-shape check passed with synthetic values and no network connection. Repeating the local seed confirmed no records/passwords changed. Filename-only secret scanning found no NVIDIA key in source, tests, docs, public assets or static build output; Git ignore checks cover local environment, demo access and Vercel metadata. Actual cafe/studio screenshots were visually reviewed. These checks do not establish hosted service readiness.

## Handoff and remaining external checks

Open [localhost:3000](http://localhost:3000) and follow [MANUAL_TESTING.md](MANUAL_TESTING.md). [DEMO.md](DEMO.md) explains access, history and presentation order. [DEPLOYMENT.md](DEPLOYMENT.md) contains the production runbook.

The user will connect GitHub/Vercel later, so no remote CI, hosted PostgreSQL, deployment URL or production load test is verified. Google credentials remain deferred. Earlier live NVIDIA probes timed out; live analysis/assistant/optional summaries still need a successful provider smoke test. The intended real administrator has not been named and was not guessed. Existing development-only dependency advisories are documented in the hardening/deployment guides. These operational limitations remain visible; completing local implementation does not assert that every external acceptance criterion has passed.
