# API

## Phase 13 validation refinements

Text request bodies are decoded as strict UTF-8 within their existing byte limits. Invalid/truncated encoding or interrupted uploads return safe 400 responses; actual-byte overflow still returns 413. Record listing, import history and template queries reject duplicate keys. History permits only `page`; templates permit only `type` and `format`. Admin/report query parsing preserves all own keys reaching the handler for strict validation. Next.js can normalize some special query keys before application handlers; ownership never depends on query fields. See [HARDENING.md](HARDENING.md).

## Implemented in Phase 1

### GET /api/health

Public, read-only liveness endpoint:

```json
{ "status": "ok" }
```

Returns HTTP 200 with `Cache-Control: no-store`. It confirms that the application can serve a request; it does not check PostgreSQL or OpenAI readiness and never includes connection details, environment variables, or user data. Database readiness is verified locally/through CI with `npm run db:check`.

## Implemented in Phase 2

### POST /api/auth/register

Public registration accepts JSON `{ "name": "...", "email": "...", "password": "..." }` only. Name is 1–80 trimmed characters, email is valid and at most 254 characters, and password is 12–128 characters. Unknown fields (including role/status) are rejected. Passwords preserve whitespace. Body limit: 8 KiB. The `Origin` header must exactly match `NEXTAUTH_URL`; cross-site requests fail.

Valid new and duplicate submissions both return HTTP 202 with the same generic message. Existing accounts/hashes are never replaced. Invalid input returns 400, missing/cross-site origin 403, oversized body 413, wrong content type 415, throttling 429, and infrastructure failure 503. All responses are uncached and omit submitted secrets.

### GET/POST /api/auth/[...nextauth]

Framework routes provide provider discovery, CSRF tokens, password/Google callbacks, encrypted sessions, and sign-out. Use NextAuth's client helpers rather than bypassing its CSRF flow. POST bodies are bounded to 16 KiB before passing the unchanged request to the framework. Google is registered only when both server-side credentials are configured. Session output contains only public identity fields; suspended/deleted users have no usable identity. No passwords or provider tokens are returned.

### GET /api/me

Requires an active server-side identity. Returns `{ "user": { "id", "name", "email", "image", "role", "status" } }` with current database values and `Cache-Control: no-store`. Missing or suspended session identities return 401; guard-level forbidden access returns 403. No administration or business data is included. The shared `requireUser("ADMIN")` helper is used by the Phase 12 admin APIs documented below.

## Implemented in Phase 3

All business endpoints require an active authenticated user. Reads are uncached; another owner's valid business ID and an unknown valid ID both return 404. ADMIN does not bypass ownership. POST/PUT/DELETE require an exact same-origin JSON request with an 8 KiB body limit.

| Method and path                          | Behavior                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/v1/businesses`                 | Return the current owner's profiles in creation/id order                                |
| `POST /api/v1/businesses`                | Create a profile, make it active in this browser, return 201                            |
| `GET /api/v1/businesses/[businessId]`    | Return one owned profile                                                                |
| `PUT /api/v1/businesses/[businessId]`    | Replace editable profile fields with a required current version                         |
| `DELETE /api/v1/businesses/[businessId]` | Confirm current name/version, delete, and clear a matching selection cookie; return 204 |
| `POST /api/v1/businesses/selection`      | Validate ownership and store the selected business preference                           |

Create body example:

```json
{
  "name": "Olive Cafe",
  "businessType": "CAFE",
  "otherBusinessType": null,
  "location": "Riyadh",
  "currency": "SAR",
  "timezone": "Asia/Riyadh"
}
```

Types: RESTAURANT, CAFE, RETAIL, E_COMMERCE, SERVICE_PROVIDER, STARTUP, PROFESSIONAL_SERVICES, OTHER. Other requires custom text; other types require null/omitted custom text. Name is 1–120 trimmed single-line characters, custom type at most 120, location at most 180. The server validates currency and timezone. Optional empty strings become null. PUT uses the same fields plus integer `version`. DELETE uses `{ "confirmationName": "Olive Cafe", "version": 1 }`. Selection uses `{ "businessId": "..." }`.

Unexpected fields, including ownerId/lock metadata, return 400. Conflicting version or locked currency/timezone returns 409. Incorrect deletion confirmation returns 422. Origin/content/body failures use 403/415/413; unavailable infrastructure uses a generic 503. A business response includes id, editable fields, version, lock timestamp (or null), and ISO audit timestamps, without ownerId or unrelated user data.

## Implemented in Phase 4

The resource allowlist is `products`, `sales`, `expense-categories`, `expenses`, `customer-metrics`, and `feedback`. These routes share the Phase 3 active-user, ownership (including ADMIN), same-origin JSON, 8 KiB body limit, and no-store requirements. Unknown resources return 404.

| Method and path                                                | Behavior                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GET `/api/v1/businesses/[businessId]/[resource]`               | Paginated `{ records, total, page, pageSize }`                                         |
| POST `/api/v1/businesses/[businessId]/[resource]`              | Create a manual record; return `{ record }`, 201                                       |
| GET `/api/v1/businesses/[businessId]/[resource]/[recordId]`    | Return one owned `{ record }`                                                          |
| PUT `/api/v1/businesses/[businessId]/[resource]/[recordId]`    | Replace editable fields with required `version`; return `{ record }`                   |
| DELETE `/api/v1/businesses/[businessId]/[resource]/[recordId]` | Require `{ version, confirmed: true }`; return 204. Products must be archived instead. |

Create/PUT fields (PUT adds positive integer `version`; unknown fields rejected):

| Resource           | Writable fields                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| products           | `name`, `type` PRODUCT/SERVICE, optional `category`, nullable `costPrice`, `sellingPrice`, boolean `active`                         |
| sales              | `saleDate`, nullable `productServiceId`, `quantity`, `unitPrice`, nullable `unitCost`, `costMode` CATALOG/EXPLICIT, optional `note` |
| expense-categories | `name`, `classification` OPERATING/INVENTORY_PURCHASE/OTHER                                                                         |
| expenses           | `expenseDate`, `categoryId`, `amount`, optional `description`                                                                       |
| customer-metrics   | `metricDate`, integer `customerCount`                                                                                               |
| feedback           | `feedbackDate`, `feedbackText`                                                                                                      |

Dates are YYYY-MM-DD strings. Prices, quantities, costs, and amounts are validated decimal strings, never numeric JSON. `CATALOG` requires an owned product and null submitted `unitCost`; the server copies current cost. `EXPLICIT` uses the supplied value/null and is the edit form's default, preserving its loaded historical cost. Total amount, source, business ownership, expense snapshots, and feedback analysis are server-controlled. See [precision and snapshot rules](CORE_RECORDS.md).

Query parameters: page (1–100000, default 1), pageSize (1–100, default 20), order asc/desc (default desc), sort date/name/amount (default date), search (up to 120 characters), from/to (inclusive dates), productId (sales), categoryId (expenses), category (catalog text), active all/true/false (catalog). Primary sorting is record date for dated resources and name for products/categories; amount sorts product price, sale total, or expense amount. ID breaks ties. Filters unrelated to a resource have no effect. Listing never returns another business's records, even with foreign filter IDs.

Responses expose public record fields, ID/version, date strings, and decimal strings. Expense reads include categoryName; sale reads retain itemName. Costs distinguish null from "0". Creates use MANUAL source; imports and AI fields cannot be injected. Invalid schema/body returns 400; invalid owned references, archived new-sale items, excessive total/expense precision, or product deletion return 422. Duplicate category/day, stale versions, or category-in-use conflicts return 409. Unknown/foreign record IDs return 404. Infrastructure errors are generic 503.

## Implemented in Phase 5

### GET /api/v1/businesses/[businessId]/dashboard

Read-only, active authenticated owner only, including ADMIN actors. Always `Cache-Control: no-store`. The Overview page calls the same service directly. There are no dashboard mutation endpoints.

Parameters: `period=7d|30d|90d|custom` (default `30d`). Custom requires `from=YYYY-MM-DD&to=YYYY-MM-DD`; presets must omit them. Dates are inclusive, ordered, no later than today in the business timezone, and cover at most 366 days. The preceding equal-length period must fit within supported calendar years. Unknown fields, arrays, duplicate keys and invalid dates return 400; missing/suspended sessions return 401; foreign/unknown business IDs return 404; infrastructure failures use the existing generic 503 response.

Example: `/api/v1/businesses/<owned-id>/dashboard?period=custom&from=2024-02-22&to=2024-02-28`.

Response fields:

- `business`: id, name, currency, timezone only.
- `period`: preset, business-local today, inclusive current and previous `{ from, to, days }`.
- `current` and `previous`: revenue, cogs, operating, inventory, other, totalExpenses, profit, margin, transactions, averageSale, costKnown, costMissing, costCoverage, visits, customerDays.
- `comparison`: revenueGrowth and visitGrowth (percentage strings or null).
- `series`: up to 366 daily `{ date, revenue, operating, totalExpenses, profit, visits, costMissing }` points. Missing visits are null.
- `topRevenue`, `bestSelling`: up to five `{ id, name, revenue, quantity, transactions }` historical product groups; id may be null for unlinked sales.
- `categories`: up to eight `{ name, classification, amount }` groups plus a MIXED Additional categories remainder if needed.
- `sentiment`: positive, neutral, negative, unknown, pending, failed, total counts. Only completed analysis contributes to a known sentiment.
- `hasFinancialRecords` for the current period and `generatedAt` ISO timestamp.

Money/quantities/percentages are decimal strings, ratios can be null, and record counts are integers. No owner ID, feedback text, raw financial records, or authentication fields are exposed. See [DASHBOARD.md](DASHBOARD.md) for calculation semantics and rounding.

## Implemented in Phase 6

Import routes under `/api/v1/businesses/[businessId]/imports` require an active authenticated owner, including ADMIN, and return `Cache-Control: no-store`. POST routes check ownership before reading/processing the upload, and require the configured same origin. There is no JSON import endpoint and no client-supplied normalized-row payload.

| Method and suffix                         | Input and response                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/preview`                           | Multipart `file` + `importType`. Returns token, expiry, business/currency/timezone, file metadata, headers, counts and rows with values/errors/warnings/resolved matches. No database writes. |
| POST `/confirm`                           | Multipart same file/type + `token` + literal `confirmed=true`. Returns `{ item, alreadyImported }`: 201 for a committed import, 200 for an idempotent retry.                                  |
| GET base path                             | Optional page=1..100000; returns `{ items, total, page, pageSize: 20 }`, newest first.                                                                                                        |
| GET `/[importId]`                         | Original import metadata/counts plus `{ row, errors }[]` in validationErrors. Unknown/foreign import ID returns 404.                                                                          |
| GET `/template?type=...&format=csv\|xlsx` | Header-only downloadable template; constant safe attachment filename and no-store/nosniff headers.                                                                                            |

Import types: PRODUCTS, SALES, EXPENSES, CUSTOMER_METRICS, FEEDBACK. Repeated/extra multipart fields and missing explicit confirmation return 400; missing/suspended HTTP session 401; origin violation 403; unknown/foreign business 404; stale/invalid/expired preview or already-imported preview 409; size limits 413; unsupported extension/MIME 415; invalid file structure/no valid rows 422. Row validation errors are returned within a successful preview, not a generic request failure. Unexpected infrastructure failures are sanitized 503. Rejected or abandoned uploads do not create history.

History items include id, fileName, fileType, importType, status, totalRows, importedRows, failedRows and createdAt. They omit raw bytes, file hash, ownership/account fields and original invalid cell values. Record reads now include source/dataImportId; ordinary mutations reject attempts to set either. See [IMPORTS.md](IMPORTS.md) for column contracts, accounting rules, limits and safe partial retries.

## Implemented in Phase 7

Forecast routes under `/api/v1/businesses/[businessId]/forecasts` require an active authenticated owner, including ADMIN, and return `Cache-Control: no-store`. Both server-rendered pages and Route Handlers use the same authorized service. Numeric monetary/model values are decimal strings, dates are YYYY-MM-DD, and audit times are ISO timestamps.

| Method and suffix   | Input and response                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/eligibility`  | Optional `metricType=REVENUE\|EXPENSE` and `horizon=DAYS_7\|DAYS_30\|MONTHS_3`, defaulting to REVENUE/DAYS_7. Returns businessId/currency/timezone, options, calendar plan, historyHash, trainingStart, totalDays, recordedDays, gapDays/gapDates, minimumDays, eligible and message. No writes. |
| POST base path      | Same-origin JSON `{ metricType, horizon, historyHash, confirmGaps }`, all required. Returns `{ item, alreadyGenerated }`: 201 for a new run or 200 for the same reviewed history/options/version. Never accepts client predictions, parameters or error scores.                                  |
| GET base path       | Optional `page=1..100000`; returns `{ items, total, page, pageSize: 20 }` newest first. Metadata only, without the historical JSON arrays.                                                                                                                                                       |
| GET `/[forecastId]` | One saved result including metadata, history, dailyForecast, backtest and displayed points. Foreign/unknown run IDs return 404.                                                                                                                                                                  |

`eligible` means the recorded-date threshold is met, not that gap confirmation can be skipped. The client must review `gapDates` and send `confirmGaps: true` if any exist; the server rereads the history under the business lock and validates its hash. An unchanged aggregate review can reuse a prior snapshot. See [FORECASTING.md](FORECASTING.md) for the 366-day bound, minimums, metric definitions and calendar periods.

List items expose id, metricType, horizon, currency, forecastStart/forecastEnd, total and createdAt. Detail adds businessId, timezone, algorithm, granularity, trainingStart/trainingEnd, recordedDays/gapDays/gapsConfirmed, alpha/beta, trainingCount/backtestCount, mae/mape/mapeSamples/baselineMae and clampedCount. Arrays are bounded: history `{ date, value, recorded }`, dailyForecast `{ date, value, clamped }`, backtest `{ date, actual, predicted, baseline, recorded }`, and points `{ date, endDate, value }`. MAPE is null when no nonzero holdout actuals exist. Interval bounds are not returned because intervals are not implemented.

Unknown/duplicate query keys, invalid enums/hash/page and injected body fields return 400; missing/suspended sessions 401; wrong/missing origin 403; foreign/unknown business/run 404; stale history/date review or write conflict 409; body over 8 KiB 413; non-JSON 415; insufficient recorded dates, unconfirmed gaps or unsupported model amounts 422. Unexpected infrastructure errors are generic 503. No forecast update/delete endpoint is exposed; deleting a business cascades through its saved runs and points.

## Implemented in Phase 8

`/api/v1/businesses/[businessId]/feedback-analysis` requires the current active owner, including ADMIN, and returns no-store responses.

| Method | Request and result                                                                                                                                                                                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | All-time feedback insights: total/analyzed/pending/failed/inProgress, nextAllowedAt ISO timestamp, sentiments with counts and nullable percentages, and topic counts split into positive/negative. Independent of table filters.                                                                                                         |
| POST   | Same-origin JSON: `{ "mode": "PENDING" }`, `{ "mode": "FAILED" }`, or `{ "mode": "SINGLE", "recordId": "...", "version": 1 }`. Batch modes process up to three oldest matching entries. Returns 200 with attempted/analyzed/failed/skipped counts and nextAllowedAt; failed individual analyses are retained as FAILED, not thrown away. |

Unknown body fields/enums or invalid IDs/versions return 400; missing or revoked/suspended session 401; invalid origin or suspension detected by a service after authentication 403; foreign/unknown business or record 404; cooldown, active work, stale version or already-analyzed entry 409. JSON/content/body rules remain 8 KiB and 413/415. Missing AI configuration before a claim returns a safe 503 without changing entries. Other infrastructure failures are generic 503. Provider timeout/rate limit/invalid output/refusal after a claim are per-row results, so a completed batch can return 200 with failed > 0.

Existing feedback record reads additionally expose analysisError (safe code), analysisProvider, analysisModel, analysisPromptVersion and analyzedAt (UTC ISO). They never expose lease tokens. Record writes still accept only date/text and the version envelope; edits clear stale analysis. See [AI_INTEGRATION.md](AI_INTEGRATION.md) for the lease/retry/privacy contract.

## Implemented in Phase 9

The base path is `/api/v1/businesses/[businessId]/conversations`. Every route requires a fresh active session and business ownership (including ADMIN), and uses private no-store responses. All IDs are validated; the server supplies context and conversation history.

| Method/path                         | Request and response                                                                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET base                            | Optional `?page=1` (1–100000, exactly one value, no other query keys); returns `{ items, total, page, pageSize: 20 }`, newest updated conversations first                                                                                            |
| POST base                           | Dashboard period body: `{ "period": "30d" }`, `7d`, `90d`, or `{ "period": "custom", "from": "2026-10-01", "to": "2026-10-08" }`; omitted period defaults to 30d. Returns 201 `{ conversation }` with fixed resolved dates                           |
| GET base/[conversationId]           | Optional page as above; returns `{ conversation, messages, page, pageSize, nextAllowedAt, hasActiveRequest }`; latest 20 messages on page 1, chronological within each page                                                                          |
| POST base/[conversationId]/messages | `{ "version": 1, "requestId": "UUID", "message": "Explain my estimated profit" }`; message is trimmed, nonempty and at most 2000 characters. Returns 200 conversation detail after completion, including a FAILED answer slot if the provider failed |
| POST base/[conversationId]/retry    | `{ "version": 3, "messageId": "..." }`; retries only the latest failed/expired assistant slot and returns detail without creating another pair                                                                                                       |
| DELETE base/[conversationId]        | `{ "version": 3, "confirmed": true }`; cascades messages/snapshots and returns 200 `{ "deleted": true }`                                                                                                                                             |

Mutation bodies require same-origin JSON, an 8 KiB maximum and strict fields. Conversation DTOs expose ID/title/fixed dates/version/messageCount/timestamps. Message DTOs expose ID/sequence/role/content/status/inScope/referencedMetrics/warnings/errorCode/retryable/model/timestamp and saved context; private lease tokens, provider credentials and raw responses are never exposed. `nextAllowedAt` is the per-business chat cooldown timestamp, independent of feedback cooldown.

Malformed input/query is 400; missing/revoked/suspended session 401; origin mismatch or suspension detected later in the service 403; foreign/unknown business, conversation or message 404; stale version, active work, cooldown or conflicting UUID 409; message-count/context limit 422; unsupported content type 415; oversized body 413. Missing configuration before claim or infrastructure failure is a safe 503. A claimed provider failure normally returns 200 with a safe FAILED message and retained question, so clients must inspect status rather than assuming HTTP 200 means an answer exists. Sending the same UUID and question is idempotent and returns current detail.

Workspace pages also reject conversations outside the selected business. Because the workspace has a loading/streaming boundary, a page can render the not-found screen after an initial HTTP 200; the corresponding JSON API always returns 404 and never returns that conversation. See [BUSINESS_ASSISTANT.md](BUSINESS_ASSISTANT.md) for data, scope, retry and privacy rules.

## Implemented in Phase 10

All paths below start with `/api/v1/businesses/[businessId]`. They require a current active owner (ADMIN does not bypass ownership), use private no-store responses, and validate child IDs. Alert evaluation is local and requires no AI credentials.

| Method/path                   | Contract                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/alerts`                 | Optional `page` (1–100000), `status` (ALL/UNREAD/READ/DISMISSED) and `type` (ALL or a rule type). Defaults: page 1, ALL/ALL. Rejects duplicate/unknown filters. Evaluates fixed policy dates, then returns items, total, counts, page/pageSize=20, rules, evaluations, period and createdCount |
| GET `/alerts/summary`         | Read-only `{ unread, read, dismissed }` counts for the business                                                                                                                                                                                                                                |
| POST `/alerts/evaluate`       | Strict `{}` body; returns rules, period, evaluations and createdCount                                                                                                                                                                                                                          |
| PATCH `/alerts/[alertId]`     | `{ "version": 1, "status": "READ" }` or DISMISSED; returns `{ alert }`. Same-status requests are idempotent; dismissed alerts cannot return to read/unread                                                                                                                                     |
| POST `/alerts/read-all`       | Strict `{}`; returns `{ changed }` for all currently unread alerts in the business, regardless of filters                                                                                                                                                                                      |
| GET `/alert-rules`            | Read-only `{ rules }`; each rule has id/type/enabled/threshold string/version                                                                                                                                                                                                                  |
| PATCH `/alert-rules/[ruleId]` | `{ "version": 1, "enabled": true, "threshold": "20.25" }`; validates per-type bounds, saves and immediately evaluates; returns rules, period, evaluations and createdCount                                                                                                                     |

Alert DTOs contain id/type/title/message/severity/status/version, fixed period dates, createdAt/readAt/dismissedAt and the immutable evidence object. No private source rows, secrets or other businesses' data are returned. Mutations share the existing same-origin JSON policy: 8 KiB body limit, 413 for excessive size, 415 for unsupported media type. Invalid fields/IDs/queries return 400; unauthenticated/revoked/suspended session 401; invalid origin or suspension caught later by the service 403; foreign/unknown resources 404; stale versions or invalid dismissed transitions 409; out-of-range thresholds 422; infrastructure errors a sanitized 503. The backend computes fingerprints/evidence and never accepts them from clients.

Dashboard GET/page loads can persist deduplicated alerts as part of analytics recalculation. Their 30-completed-day policy is independent of dashboard query filters. Read-only count/rule endpoints do not evaluate. See [ALERTS.md](ALERTS.md) for precise comparisons, missing-data guards, forecast baseline, automatic triggers and history semantics.

## Implemented in Phase 11

Report base: `/api/v1/businesses/[businessId]/reports`. Every endpoint requires the current active owner, validates nested IDs and returns private no-store responses. ADMIN cannot read another owner's business. Mutations require same-origin JSON, strict fields and the shared 8 KiB body limit.

| Method/path                  | Contract                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET base                     | Optional `page` (1–100000) and `type` (ALL/WEEKLY/MONTHLY/CUSTOM), default 1/ALL; duplicate/unknown keys rejected. Returns `{ items, total, page, pageSize: 20, type }`, newest first, without full snapshots                  |
| POST base                    | `{ "requestId": "UUID", "reportType": "WEEKLY" }` or MONTHLY; CUSTOM additionally requires `from` and `to` date strings. Dates are rejected for presets. Returns `{ report, alreadyGenerated }`: 201 new, 200 identical replay |
| GET base/[reportId]          | `{ report }` containing the saved snapshot and deterministic/optional AI summary                                                                                                                                               |
| GET base/[reportId]/pdf      | Authenticated PDF attachment rendered from saved content; Node runtime, maxDuration=60, no AI call                                                                                                                             |
| POST base/[reportId]/summary | Strict `{}`; returns 200 `{ report }` after completion, including FAILED status if the provider is unavailable; Node runtime, maxDuration=90                                                                                   |

Report DTOs expose ID/type, from/to, saved business name/currency/timezone, creation time, deterministic summary, AI status/summary/safe error/model/completion time and retryable state. Detail additionally includes schema-versioned context and observations. Request hashes, private lease tokens, attempts and provider credentials are not returned. Clients must inspect `aiStatus`: 200 does not guarantee an AI summary was produced.

Malformed body/query/IDs are 400; missing/revoked/suspended sessions 401; origin mismatch or suspension caught later by the service 403; foreign/unknown business/report 404; conflicting UUID or active AI attempt 409; oversized body 413; unsupported media type 415; invalid date range/snapshot size 422; per-business AI cooldown 429; unsupported snapshot version/infrastructure failure a safe 503. Presets use completed business-local calendar periods; custom periods allow 1–366 days through today. Creation permanently locks financial settings even with empty data. See [REPORTS.md](REPORTS.md) for snapshot, AI recovery, privacy and PDF limits. No report edit/delete API is exposed; whole-business deletion cascades reports.

## Implemented in Phase 12

All routes below require a current active ADMIN identity and independently recheck the actor in the service. Responses use `Cache-Control: no-store`. Administration does not grant access to private owner-scoped business content.

| Method/path under `/api/v1/admin` | Contract                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/statistics`                 | No query parameters. Returns `{ totalUsers, activeUsers, suspendedUsers, totalBusinesses }`                                                                        |
| GET `/users`                      | Optional `q`, `page`, `status` (ALL/ACTIVE/SUSPENDED), `role` (ALL/USER/ADMIN). Returns `{ items, total, pageSize: 20, q, page, status, role }`                    |
| GET `/businesses`                 | Optional `q`, `page`, `type` (ALL or a supported BusinessType). Returns `{ items, total, pageSize: 20, q, page, type }`                                            |
| PATCH `/users/[userId]/status`    | Strict `{ "status": "SUSPENDED", "version": 1, "confirmed": true }` or ACTIVE. Returns `{ user, changed }`; a current-version same-state request has changed=false |

List defaults are page=1, empty search and ALL filters. Search is bounded to 120 single-line characters and is case-insensitive with literal wildcard handling; page is bounded to 1–100000. Reject duplicate/unknown query fields. User DTO: ID, name, email, role, status, statusVersion, createdAt, businessCount. Business DTO: ID, name, businessType, createdAt and owner { ID, name, email, status }. No credentials or private business content are selected.

Mutations require exact same-origin JSON and at most 8 KiB. Invalid fields/query/IDs return 400; missing/revoked/suspended session 401; ordinary role, invalid origin or later actor suspension/demotion 403; unknown target 404; stale version or self-status changes 409; oversized body 413; wrong media type 415; infrastructure errors a safe 503. There is no promotion, account-delete, impersonation or business-edit endpoint under admin. Role provisioning is an explicit operator-only CLI, documented in [ADMINISTRATION.md](ADMINISTRATION.md).

## Future API

Future endpoints must retain active-account checks, strict validation, and appropriate ownership or admin authorization. Do not add a global admin bypass to business-content services.
