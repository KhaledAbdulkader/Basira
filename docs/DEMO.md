# Local Basira demonstration

All demonstration data is synthetic. The seed runs locally and never calls Google, NVIDIA or another external API.

## Setup

```sh
npm ci
npm run db:deploy
npm run db:seed:demo -- --local
npm run dev
```

Use the configured local PostgreSQL connection (on this machine localhost:5433). Open [localhost:3000](http://localhost:3000). Sign in as `demo@basira.example` with the random password saved in `.local/demo-access.json`. That ignored file is private local access information, not a shareable artifact. `basira_local` is the database role, not the website account.

The command accepts only loopback `DATABASE_URL` connections to a database named `*_dev` or `*_demo` with the public schema. It rejects production mode, Vercel and CI. No production/demo account is created by build, install, migrations or deployment. Integration tests call the seed service only against their separately guarded `_test` database.

## Data

| Business                       | History                                             | Demonstration                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Olive & Oak Cafe (Demo)        | 210 completed days ending the day before first seed | Six products, thousands of separate transactions, weekly demand patterns, a recent revenue decline, expenses across all three classifications, incomplete historical unit costs, daily visits and pending English/Arabic feedback. |
| Clearline Design Studio (Demo) | 21 completed days                                   | Three services, unknown consultation cost, Sunday zero visits, sparse expense dates, separate business context and insufficient data for longer forecast horizons.                                                                 |

Both businesses use SAR and Asia/Riyadh. Every sale is one transaction for one product/service, not a daily sales aggregate. Prices/costs are historical snapshots. Inventory purchases are stored as `INVENTORY_PURCHASE`, separate from `OPERATING` expenses; `OTHER` remains separately disclosed. Database triggers lock currency and timezone. Customer totals include repeat visits.

The dataset is deterministic for a given end date; IDs and the password are generated independently. Inserts are atomic under one transaction and an advisory lock. A repeat invocation is a no-op: it preserves edits, records, deletions and the existing password. It does not move the history forward. A collision with a different account using the reserved email/ID aborts. Losing the access file does not trigger a password reset.

There is no destructive reset command. Use a separate new local demo database for a fresh dated presentation, or use custom date filters within existing history. Do not rename a production connection to bypass the local seed guard. Keep the access file associated with its database; existing credentials are checked on repeat runs.

Feedback is genuinely pending analysis. The seed does not forge AI outputs, forecast scores, imports, saved reports or administrator privileges. Generate forecasts, evaluate alerts and create reports using the application so saved results come from the real calculation services. These deterministic features work without AI configuration.

## Suggested presentation (15 minutes)

1. Sign in, show the cafe Overview and change its period. Explain cost coverage and the profit formula.
2. Inspect a sale and an inventory purchase. Demonstrate that inventory is not deducted again from profit.
3. Switch to the studio to demonstrate independent records and missing-cost disclosure.
4. Return to the cafe and generate 7-day, 30-day and three-month forecasts. Explain historical backtesting and limitations.
5. Show the studio's insufficient-history state and any explicit zero-gap confirmation.
6. Show alerts and mark one read. Re-evaluate to demonstrate deduplication.
7. Create a report and download its PDF. Explain that it is a saved snapshot.
8. Demonstrate feedback analysis and an in-scope/out-of-scope assistant question only if the live provider smoke test has passed. Otherwise show the saved input and honest provider-unavailable state.
9. Toggle dark mode and show the mobile navigation. Sign out.

Use [MANUAL_TESTING.md](MANUAL_TESTING.md) for the full acceptance checklist and exact financial example. Google OAuth, an explicitly chosen administrator, and live AI readiness are separate configuration steps, not automatic seed side effects.
