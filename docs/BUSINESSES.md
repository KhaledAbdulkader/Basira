# Business profiles and settings

Phase 3 implements business CRUD, a persistent switcher, owner authorization, and profile settings. Phase 4 adds [core records](CORE_RECORDS.md) and default expense categories. Imports, analytics, and alert rules remain for their specified phases.

## Use the feature

1. Sign in and choose **Create your first business** on Overview, or open **Businesses → Add business**.
2. Enter a name, choose one of the eight business types, and supply a custom description when choosing Other. Location is optional.
3. Choose an ISO currency code and a named IANA timezone. The create form suggests the browser's timezone when it is in the available list; UTC is the fallback. Both settings remain editable before financial history starts.
4. Choose **Create business**. The new profile becomes active and appears on Overview. Create more businesses in the same way.
5. Use **Active business** in the desktop sidebar or mobile navigation drawer to switch. The app opens a fresh workspace so previously loaded business state is discarded. The preference lasts up to 30 days in this browser.
6. Open **Business settings** from Overview, **Settings** in navigation, or **Manage settings** on a business card. Save changes to persist its profile.
7. To delete, use the danger section in that business's settings, read the confirmation, and type its current name exactly. The server also checks the current profile version. Deletion preserves your account and other businesses. After deletion, another owned business becomes active, or the empty state appears.

The switcher preference is an HttpOnly, SameSite=Lax cookie, Secure on HTTPS. It is navigation state only: every use resolves the preference against the signed-in owner's current business list. A missing, stale, or foreign ID falls back to the first owned business in creation/id order. Changing accounts cannot reveal the previous owner's records. Separate tabs may keep a previously rendered view until navigation or reload; future record operations must carry explicit authorized business IDs.

## Ownership and requests

`src/lib/business/service.ts` checks an active database user and scopes all reads/writes to `ownerId`. API handlers derive that user ID from the authenticated server session. ADMIN does not bypass ownership. Unknown and another owner's valid IDs both return 404, without exposing names or metadata. All mutation routes require the exact configured origin, JSON, and an 8 KiB streamed-body limit. Input schemas reject ownership, lock-marker, and other unexpected fields.

Every update supplies the current integer `version`; updates increment it. A stale edit returns 409 and the UI offers a reload instead of silently overwriting newer settings. Deletion also needs the exact current name/version. The API uses a full-profile PUT so omitted editable fields are unambiguous. Owner identity is not part of client business responses.

## Currency and timezone history

Currency changes after financial records were already prohibited by the approved project decisions. On 2026-09-27, the user also approved **locking timezone after financial records**. `financialSettingsLockedAt` records this permanent boundary. Neither field can change once it is set, and normal API requests cannot set or clear it. Other profile fields remain editable. No automatic conversion or historical date reinterpretation is performed.

Profile updates, deletion, and `lockFinancialSettings()` lock the same business row. The helper must be called within the **same transaction** as the first financial record, before using its currency/timezone or writing amounts. This serializes it with simultaneous settings changes. A failed transaction rolls back both the marker and its work. A PostgreSQL trigger additionally blocks changing currency/timezone or clearing/changing an existing marker, including ordinary direct SQL updates.

Ordinary profile creation does not lock settings. In Phase 4, priced products/services, sales, and expenses call the helper transactionally; insert/update triggers also cover ordinary direct database writes. Category, customer-count, and feedback entry alone do not lock settings. Monetary imports, saved forecasts and Phase 11 reports also use this lock. Even an empty saved report preserves monetary meaning and permanently locks currency/timezone; its creation screen explains this. Default expense categories and alert rules are created with each business.

## Database and deletion

Migration `20260926221509_phase_3_businesses` adds BusinessType, Business, an owner/creation/id index, checks, and the financial-settings trigger. The migration timestamp is UTC; implementation work occurred on September 27 locally. The user relationship restricts accidental user deletion while businesses exist. Business settings have bounded string lengths, nullable optional fields, UTC audit timestamps, and a positive version. Names are single-line text so they can be typed exactly in the deletion confirmation.

Phase 4 adds and tests whole-business cascades for products/services, sales, expense categories, expenses, customer counts, and feedback. Composite child references use NoAction to protect individual referenced records while permitting the entire business graph to be removed atomically. Later phases extend these cascade checks through imports, forecasts, chat, alerts and Phase 11 reports.

## Verification

Unit tests cover validation and untrusted selection fallback. Real PostgreSQL tests cover multiple businesses, ownership including ADMIN, suspended users, stale updates, confirmed deletion, immutable locks, rollback, and concurrency. Browser tests cover the complete create/switch/edit/delete flow, mobile drawer use, reload persistence, forged cookies/URLs, CSRF-origin checks, stale conflicts, and disabled locked settings. Tests use only the isolated `_test` database.

The cookie implementation follows the [Next.js request-time cookie API](https://nextjs.org/docs/app/api-reference/functions/cookies). Currency/timezone options come from the server runtime's [ECMAScript internationalization API](https://tc39.es/ecma402/#sec-intl.supportedvaluesof), and the server validates submitted values independently of the dropdown.
