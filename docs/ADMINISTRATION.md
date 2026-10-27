# Administration

Phase 12 adds an administration area for current active ADMIN accounts. It provides platform statistics, searchable/filterable users, confirmed activation/suspension, and a read-only business directory. The Admin link appears only for admins in desktop and compact navigation; every page, API handler and service also checks authorization on the server. Business selection is not required and is not changed by browsing the directory.

## Access and first administrator

New registrations always remain USER/ACTIVE. No default administrator, shared password, public promotion endpoint, impersonation flow or role-editing UI is provided. An operator with the configured database credentials can grant the role to a specifically named existing active account:

```sh
npm run admin:grant -- --email "existing-account@example.com"
```

Register the intended account normally first. Run the command from this project against the intended `DATABASE_URL`, then refresh that account's workspace and open `/admin`. It refuses missing/suspended accounts, is idempotent for an existing admin, and changes only the role. It neither creates users nor resets passwords, activates suspended accounts or prints credentials. There are no new environment variables. This command is for a trusted local/deployment operator, never a web request. Granting an actual local account requires its explicit email; implementation and automated testing do not choose one implicitly.

## Metadata boundary

Statistics report current total users, active users, suspended users and total businesses. Counts include administrator accounts and businesses belonging to suspended users. They are read from a Repeatable Read transaction; there are no revenue totals, private-content samples or provider calls.

User rows expose only ID, display name, email, role, status, status version, UTC creation time and business count. Search matches name/email without case sensitivity, with optional status and role filters. Business rows expose only ID, name, business type, UTC creation time and owner ID/name/email/status. Business search matches name or owner name/email, with an optional business-type filter. The directory has no links into another owner's records or mutation controls.

Both lists are paginated at 20 rows, ordered by creation time and ID descending. Page is bounded to 1–100000, search to 120 single-line characters. Unknown/duplicate query fields are rejected. Percent, underscore and backslash are escaped for literal matching rather than acting as SQL LIKE wildcards. Queries use Prisma parameters and explicit select lists. Password hashes, OAuth tokens, avatars, address/location, currency/timezone, sales, expenses, feedback, forecasts, reports and conversations are excluded from administration responses. ADMIN continues to receive 404 from owner-scoped business-content APIs for another owner's business.

## Status changes

The user card opens a confirmation dialog naming the account and explaining the effect. Cancel makes no request. A confirmed request includes target status, the observed status version and `confirmed: true`; injected roles/ownership fields are rejected. The service reloads the actor's active ADMIN role independently of the HTTP guard.

Mutations lock actor and target User rows in ID order, then check current authorization and version before changing status. This prevents deadlocks for mutual account changes and prevents an admin suspended by a competing transaction from completing another status change using an earlier authorization check. A stale version returns 409 with a reload instruction. A same-state request with the current version is a no-op. Self-status changes are rejected by the service, with no action button on the current account. Another active admin can manage an admin account. Together, self-protection and serialized current-actor checks prevent the supported status API from suspending the final active admin, including simultaneous mutual suspensions. Direct operator SQL remains trusted and can bypass this policy; no superuser-proof guarantee is made.

The tenth migration, `20261010130000_phase_12_admin`, adds `User.statusVersion` with a positive constraint and a trigger that increments it exactly when status changes, including ordinary direct SQL updates. A status cycle ACTIVE → SUSPENDED → ACTIVE therefore still invalidates an old confirmation. Other profile/role updates cannot rewrite this version. It also adds creation/ID indexes for the directories. Existing roles/statuses and all business records are preserved. There is no separate audit/event table in this phase; status version is concurrency metadata, not an administrative action history.

Suspension retains user/business data and blocks subsequent sign-in and protected requests, including requests with an existing JWT, through the existing fresh-database session and service checks. It does not promise cancellation of every request already in flight before suspension. Activation restores access; an unexpired eight-hour session can work again without signing in anew. This deliberately uses the established session model, rather than claiming permanent token revocation. Admin role changes made by an operator also take effect on the next protected request.

## HTTP and operational behavior

Implemented routes are `/api/v1/admin/statistics`, `/users`, `/businesses`, and PATCH `/users/[userId]/status`. See [API.md](API.md) for exact bodies and response codes. Responses are no-store. Mutations use the existing exact-origin, JSON-only, streamed 8 KiB request limit. Failures return safe messages without SQL, stack traces or credentials. Unauthorized page access shows a scoped unavailable screen; unauthenticated access redirects to login. Streaming can render a not-found page after HTTP 200, so JSON authorization codes are the API contract.

No new dependencies, external services, AI calls, emails, user deletion, business deletion, role editing, bulk actions or account settings features are added. The existing confirmed owner-only business deletion flow remains unchanged. See [PHASE_12_ADMIN.md](PHASE_12_ADMIN.md) for actual verification and remaining setup. Phase 13 hardening and Phase 14 demo/deployment remain separate work.
