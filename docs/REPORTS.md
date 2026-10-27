# Reports

Phase 11 implements saved weekly, monthly and custom reports, in-app history/detail and authenticated PDF downloads. Open **Reports** for the selected business, choose **Create report**, select a period and create the snapshot. The recorded performance summary is generated locally. An optional **Generate AI executive summary** action is available afterward; neither creation nor PDF export requires NVIDIA credentials.

## Periods and financial meaning

- Weekly means the previous completed Monday–Sunday in the business timezone.
- Monthly means the previous complete calendar month in that timezone.
- Custom dates are inclusive, at most 366 days, and cannot end after the business-local current date. Including today adds an incomplete-day warning.
- The comparison is the immediately preceding period of equal length. Growth against a zero baseline is unavailable.

Completed calendar periods and AI being off by default are communicated implementation defaults, not separately confirmed user choices. The UI describes both. There is no automatic schedule or email delivery.

Reports preserve the approved formula: **Estimated profit = Revenue - known historical COGS - Operating Expenses**. Inventory purchases and Other spending are separately disclosed and excluded from that deduction. Known zero costs count as covered; missing costs remain unknown. Both periods' coverage is visible, and profit/margin remain estimates. A sale is one complete single-product/service transaction; visits include repeats and are not unique customers or retention. Empty recorded totals do not establish zero activity.

Each report contains saved business name, currency, timezone, reporting/comparison dates, creation timestamp, revenue, all expense classifications, known COGS, estimated profit/margin, sales growth, transaction count/average, customer visits/coverage, top products by revenue and quantity, expense breakdown, feedback sentiment/topics, saved forecasts, historical alerts and deterministic observations/caveats. Feedback proportions use analyzed comments only; pending/failed comments stay explicit. The latest three saved forecasts and five non-dismissed alerts use their own dates across the business's history and are clearly labeled. Creating a report does not regenerate forecasts, analyze comments or evaluate alerts.

## Persistence and isolation

`src/lib/reports/service.ts` authorizes the current active owner at every entry point. ADMIN does not gain access to someone else's report. Child lookups include business ID; selection cookies never authorize access. History returns 20 reports per page, newest creation/id first, with an optional type filter. History does not load full JSON snapshots.

Creation takes the owned Business row lock and reads a Repeatable Read aggregate snapshot using the existing dashboard/assistant context builder. This reuses deterministic calculations without requiring chat or an AI call. A client UUID plus canonical request hash gives business-scoped idempotency, including a retry after the calendar date changes. Different content with the same UUID returns 409. Serialization conflicts retry up to two times. The transaction uses a 10-second wait and 20-second timeout; snapshot JSON is capped at 64 KiB in the service.

The ninth migration, `20261009230000_phase_11_reports`, adds Report, its type/AI-state enums and an independent business summary cooldown. A unique business/request key, date/content/state checks and an immutable-content trigger protect stored data. The database JSON bound is 128 KiB to allow PostgreSQL's JSON representation overhead. Core snapshot, labels, dates and deterministic summary cannot be rewritten. A completed AI summary and provenance cannot be rewritten either. No standalone report deletion/edit operation is exposed; confirmed whole-business deletion cascades reports.

Saving even an empty monetary report permanently locks the business currency and timezone, through both the shared transactional helper and the financial-write database trigger. The creation screen explains this. Later record edits/deletions, category/catalog renames, business renames and alert dismissals do not change old reports. PDF generation reads only the saved report, including a completed optional AI summary, rather than current business records.

## Optional AI summary

The owner explicitly requests this after saving. The UI discloses that saved business metrics, item/category names, feedback aggregates, forecast summaries and alerts are sent to the configured NVIDIA service. Owner identity, business name/location, passwords, tokens, raw transactions, raw feedback and chat history are excluded. Custom business-type text and historical labels remain untrusted data in the fixed prompt envelope.

The provider uses the existing native-fetch NVIDIA transport, the configured model, `report-summary-v1`, a strict `{ summary }` schema, 768 output tokens and a 1–1800-character output bound. It receives only calculated saved context, cannot query the database, and is instructed not to recalculate/invent facts. Independent Zod validation checks structure, not factual accuracy; the UI/PDF labels the result as optional AI interpretation to verify against recorded figures.

Claim → provider call outside the transaction → conditional completion uses a per-business 60-second cooldown, 150-second lease and unique token. Active attempts conflict; expired attempts can be retried explicitly. A stale completion cannot overwrite a newer claim, and current ownership/status is rechecked before saving. A completed summary is returned without another call. Provider/configuration failures persist a safe code and retain the deterministic report/PDF. An interrupted request may remain PENDING until its lease expires; refresh then retry. No secret, raw provider response or reasoning is saved in the report.

The route declares 90 seconds and the transport has a 60-second deadline. Automated tests use mocks or disabled credentials. No new live-provider check was made in Phase 11; earlier Phase 9 timeouts still limit claims about live reliability and semantic quality. Google OAuth configuration remains separately deferred.

## PDF implementation and limits

PDFs use the Node API of pinned `@react-pdf/renderer` 4.9.0 (MIT), with local `@fontsource/noto-sans` and `@fontsource/noto-sans-arabic` 5.3.0 fonts (SIL Open Font License). Package license files remain with their dependencies. Renderer and fonts are included in the Next server trace. No paid PDF API, browser executable, remote font request, user-controlled HTML or external image fetch is used. See the official [Node API](https://react-pdf.org/docs/v4/node), [font API](https://react-pdf.org/docs/v4/fonts) and [renderer repository](https://github.com/diegomura/react-pdf).

Shared presentation definitions drive HTML and A4 PDF tables, labels and caveats. Bounded sections stay together, long Latin identifiers can wrap, and every page has a number. Footer text uses the page's default line height because inherited custom line heights suppressed dynamic footer rendering during verification. PDF metadata preserves report creation and optional summary completion time. Exports return an attachment with a server-generated ASCII filename, `application/pdf`, `nosniff` and private no-store caching.

Latin/Arabic examples and long names were visually checked. This does not establish support for every Unicode script/emoji or perfect text extraction: the current Arabic font subset produces extraction warnings in pypdf despite readable rendered glyphs. The PDF is not tagged and no PDF/UA accessibility claim is made; the in-app version provides semantic headings and tables. There are no charts, raw row exports, custom report templates or automatic external distribution in this phase. Hosting capacity/concurrency and deployment remain unverified.
