# Hosting setup — November 17, 2026

Basira is live at [basira-two.vercel.app](https://basira-two.vercel.app), using the user's existing Neon project and a Vercel Hobby project. Both account plans were checked as Free/Hobby; no paid services were enabled.

## Configuration changes

1. Installed Neon CLI 9.6.0 and Vercel CLI 65.17.0 globally and completed the user's browser authorizations.
2. Installed the `neon` and `neon-postgres` project skills with their upstream lock file. Added a project-scoped OAuth Neon MCP server in `.codex/config.toml`. Existing global Codex configuration and the development `.env` were preserved byte-for-byte. See [NEON_SETUP.md](NEON_SETUP.md).
3. Linked Neon project `little-scene-73366240` in organization `org-plain-hall-47258406`. Production uses PostgreSQL 18 in Frankfurt. Added pooled runtime and direct migration URLs to ignored `.env.production.local`, keeping the local development/test databases unchanged.
4. Rehearsed all ten existing migrations on a temporary Neon branch, applied them to production, verified migration status, and deleted the temporary branch. No development users or records were imported.
5. Created and linked Vercel project `basira` in `khaledabdulkaders-projects`. Selected Next.js, Node 24.x, `npm ci`, `npm run build`, Fluid compute and Frankfurt (`fra1`). Added the function region to `vercel.json`. Vercel created ignored `.vercel` metadata and an ignored `.env.local` containing its OIDC token.
6. Configured Production environment variables: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, a fresh independent `NEXTAUTH_SECRET`, the existing Google client pair, and the existing NVIDIA key/model settings. No test/shadow URLs or public secrets were added. The user added the hosted Google callback in Google Cloud.
7. Corrected the Git remote to `https://github.com/KhaledAbdulkader/Basira.git` and pushed the setup and fixes to `main`.
8. Updated vulnerable runtime packages: Next.js and its ESLint plugin to 16.4.6, `@vercel/functions` to 3.11.3, Zod to 4.6.7, and the compatible transitive `fast-uri` dependency. Updated the lock file. Production dependency audit reports zero vulnerabilities; this does not claim that development-only dependencies have no advisories.
9. Added `.vercelignore` after a dry upload preview showed local files would otherwise be included. The corrected manifest excludes environment files, backups, local tooling and generated artifacts. The unsafe preview was never uploaded. `.gitignore` includes Neon CLI context; `.prettierignore` preserves upstream skills unchanged.
10. Fixed a report-generation race found by GitHub CI: concurrent requests using the same request UUID now retry their transaction after a unique-constraint conflict, then return the existing report or reject changed request fields. A deterministic PostgreSQL regression test reproduced the failure before the fix and passed afterwards.
11. Created ignored private backups, deployment/connection verification helpers, and local verification results under `.local/`. These are excluded from GitHub and Vercel uploads.
12. A Vercel CLI verification request created an automation protection-bypass secret. It was revoked immediately after the request; deployment protection remains enabled and no bypass secret was retained for release.

## Release checks

The deployed application commit is `8e589e391b3eb6a283be45564fd5da4324870f88`. Vercel deployment `dpl_7UDiVWy1uMDr3XS1fzH8Sik5xuuR` was built with Node 24.x in Frankfurt, then promoted to the canonical domain after [GitHub Actions run 44149175716](https://github.com/KhaledAbdulkader/Basira/actions/runs/44149175716) completed successfully.

The green CI run passed formatting, lint, TypeScript, 179 unit tests, 122 database tests, production dependency auditing (zero vulnerabilities), Prisma validation/migrations, the production build, and 128 browser tests with one intentional viewport skip. Local checks also passed; the report-race regression was observed failing before the fix and passing afterwards.

Public HTTPS smoke checks completed on November 17, 2026, at 21:41 Bahrain/Riyadh time:

- Health, login and registration pages responded; private identity requests rejected anonymous access.
- Google provider was enabled, and its authorization URL used the configured client and exact hosted callback. Personal Google consent/token exchange remains a user check.
- Two temporary accounts registered, signed in, and were isolated from each other's records.
- Two businesses could be created and selected. A BHD sale and classified expenses produced revenue 10.000, known COGS 4.000, operating expenses 1.000, and estimated profit 5.000. Inventory purchases of 20.000 were not double-counted. Currency and timezone changes were rejected after records existed.
- A saved report downloaded as a real PDF from the hosted function. The second account could not download it.
- The hosted Nemotron AI assistant generated and persisted an answer using the saved synthetic business data.
- The dashboard and report rendered in Edge without page errors; the dashboard screenshot was inspected.
- Logout removed session access. Both temporary accounts and all their businesses/records were deleted afterwards. No local demo data was copied.

Private evidence is in ignored `.local/hosted-verification.json`, `.local/hosted-dashboard.png`, and `.local/hosting-smoke-report.pdf`. A later documentation-only commit records these results; the deployed application source is the verified commit above.

## Operating notes and known limitations

- Vercel's CLI published and promoted the release successfully. Connecting Vercel to the GitHub repository was rejected by the integration, so automatic deployments on Git pushes are not configured. Future releases currently require an authorized CLI deployment and promotion after CI passes, or granting Vercel's GitHub application access and connecting the repository. Vercel's standard deployment protection remains enabled for deployment URLs; the canonical production address was verified publicly without a bypass.
- Google OAuth uses the hosted callback. The user must complete one real Google sign-in to verify their account's consent/test-user access; automated checks do not enter personal credentials.
- The Nemotron chat model passed both a direct synthetic check and a hosted business conversation. The separate Gemma model for feedback/report summaries timed out twice at the existing 60-second deadline. Its model selection was preserved. Deterministic reports and the rest of the app do not depend on optional AI summaries.
- Restart Codex to load the newly installed Neon MCP server; its first use may require its own OAuth authorization. CLI authorization is already complete.
- Production has a separate database. Local test accounts and demo records were not transferred. Create an account on the hosted site. No administrator account was assigned automatically.
- Backups/restore rehearsal, load testing and paid capacity were not provisioned by this setup.

## Concurrency reference

PostgreSQL notes that Repeatable Read keeps an earlier snapshot and that some unique-key conflicts require a retry of the entire transaction: [transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [serialization failure handling](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html). Basira keeps a bounded retry and revalidates ownership and the request hash each time.
