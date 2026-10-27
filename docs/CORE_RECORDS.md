# Core business records

Phase 4 implements manual products/services, sales, expense categories, expenses, daily customer counts, and feedback entry. The owner approved these policies on 2026-09-27: one sale entry is one complete transaction for one product/service; customer counts are one daily total of visits including repeat visits; refunds and negative adjustments are deferred. Implementation continued on September 28.

## Using the screens

Select your business, then open Products & Services, Sales, Expenses, Customer Metrics, or Customer Feedback. Each list has pagination and sorting. Dated records support inclusive From/To filtering. Sales filter by product; expenses by category; catalog items by category and active/archive status. Search applies to item/category names, sale item/note, expense description, or feedback text. Forms have pending/error states and keep entered values after a failed save.

Add a product/service with its current selling price and optional cost. A blank cost means unknown; zero means known zero. Uncheck Active while editing to archive an item. Archived items remain in historical sales and filters, but cannot be assigned to a new sale. Products are not hard-deleted through the API.

Add a sale with a calendar date, optional catalog item, positive quantity, and unit price. Selecting an item suggests its current price and chooses current catalog cost. You can instead explicitly enter a cost or leave it unknown. The server copies catalog cost at save time. Editing starts with the recorded cost, so changing quantity, price, or note does not implicitly refresh historical cost. Choosing “Use current catalog cost” explicitly refreshes it. A sale also keeps the item name at recording/link time; a catalog rename does not rename historical sales. An unlinked sale is allowed and can be explained in its note.

Expenses require a category and a positive amount. Manage categories from Expenses. Nine defaults are created transactionally with each new business; the migration backfills existing profiles. Rent, Salaries, Marketing, Utilities, Supplies, Transportation, and Maintenance are OPERATING; Inventory is INVENTORY_PURCHASE; Other is OTHER. Custom categories choose their classification explicitly. Names are trimmed, case-insensitively unique within a business. A used category cannot be deleted until its expenses are deliberately reassigned. Default categories can be edited or deleted when unused.

Each expense copies the category classification when assigned. Editing its amount/date/description while keeping the same category preserves that snapshot. Assigning a different category deliberately takes the new category's current classification. Category edits affect future assignments. Phase 5 now uses these snapshots for Estimated Profit: Revenue minus known historical COGS minus Operating Expenses, with cost-data coverage and separately disclosed inventory/Other spending. See [DASHBOARD.md](DASHBOARD.md).

Customer Metrics stores one nonnegative whole visit total per calendar date, including a known zero. Duplicate-date creation returns a conflict; edit the existing row to correct it. Counts are visits, not unique people across dates. Feedback capture accepts date/text only, with UNKNOWN sentiment and PENDING analysis. Editing feedback clears stale analysis and invalidates any in-flight claim. Phase 8 adds explicit NVIDIA analysis and retries; capture/import still makes no automatic AI request. See [AI_INTEGRATION.md](AI_INTEGRATION.md).

Record deletion requires an explicit confirmation dialog and current version. Business deletion retains its stronger exact-name confirmation and cascades through all six new record tables. Other businesses and the owner account remain.

## Precision and dates

- Prices/costs: decimal strings with at most 12 whole digits and 4 fractional places; stored as numeric(19,4). No exponent notation, separators, negative values, or numeric JSON coercion.
- Quantities: positive decimal strings with at most 9 whole digits and 3 fractional places; stored as numeric(18,3).
- Sale total: exact multiplication with a Decimal precision of 40, rounded once half-up to the ISO currency's minor-unit precision. Reject totals of 10^15 or above. Examples: 3 × 0.1 SAR = 0.30; 1.005 × 1 SAR = 1.01; 1 × 1.2345 JOD = 1.235; 1 × 10.5 JPY = 11.
- Expenses: positive decimal strings under 10^12, already representable in the business currency's minor units. Reject extra nonzero precision rather than silently rounding the owner's amount.
- Monetary API fields are strings. Unknown cost is null; known zero serializes as "0". Display formatting does not calculate accounting values.
- Record dates are real YYYY-MM-DD dates between 1000-01-01 and 9999-12-31, persisted as PostgreSQL date. The business timezone supplies today's suggested date. No browser offset conversion changes a date; audit timestamps remain timestamptz.
- Daily visits: integers from 0 to 2,147,483,647. Feedback: 1–2,000 trimmed characters; notes/descriptions: up to 1,000 characters. The existing streamed 8 KiB request limit still applies.

PostgreSQL's [exact numeric types](https://www.postgresql.org/docs/18/datatype-numeric.html) and [constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) support the storage and integrity rules. Application validation runs before persistence; database checks are a second layer, not a replacement for rejecting invalid input.

## Authorization, concurrency, and history

All record service entry points receive an authenticated actor and business ID. Reads check active ownership; mutations lock the owned Business row, validate the record within that business, and require a current version for edits/deletion. ADMIN does not bypass content ownership. A foreign or absent record returns the same 404. Composite foreign keys prevent linking sales to another business's product or expenses to another business's category, including direct database writes.

Catalog, sale, and expense writes call `lockFinancialSettings()` inside their transaction. Database insert/update triggers also set this permanent marker for ordinary direct financial writes. Currency and timezone cannot change after it is set, even after the last financial record is deleted. Category/customer/feedback entry alone does not set it. Failed transactions roll back their changes and any first-write marker.

All manual routes reject injected business/owner IDs, computed totals, provenance, lock metadata, and analysis fields. Mutation requests require the exact configured origin and JSON. Responses are uncached and never include database errors or stack traces. List pages contain at most 100 records (20 by default). Catalog/category choices are loaded from the current owner's business; this prototype uses ordinary select controls, suitable for small catalogs.

## Architecture and phase boundary

The six resources share list/form presentation and thin dynamic Route Handlers, with an explicit resource allowlist. Domain branches in `src/lib/records/service.ts` retain separate schemas, relation checks, and snapshot rules. No generic database access is exposed. Existing UI primitives and the generated Prisma browser-safe Decimal utility avoid adding dependencies.

Phase 6 adds import metadata and business-scoped `dataImportId` relations to all five importable record types. Normal creates remain MANUAL; confirmed imports assign IMPORT and edits preserve provenance. See [IMPORTS.md](IMPORTS.md). Phase 5 implements KPI cards, customer trends/comparisons, profit/cost coverage, and charts. Phase 7 forecasts daily sale totals and all expense amounts, preserving the distinction between recorded dates and owner-confirmed zero gaps. See [FORECASTING.md](FORECASTING.md). AI feedback analysis, alert defaults, reports, admin, and demo seed remain in their specified phases. Google configuration is still deferred by the user.

See [API.md](API.md), [TESTING.md](TESTING.md), and the [Phase 4 report](PHASE_4_CORE_RECORDS.md).
