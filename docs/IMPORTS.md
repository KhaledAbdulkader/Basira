# CSV and XLSX imports

Phase 6 supports products/services, sales, expenses, customer visits, and feedback. Open **Imports**, select a type, download a template, fill it with your own data, upload, review the preview, and explicitly confirm the valid/invalid row counts. Templates have headings only; the column guide shows illustrative values without adding sample business data.

## File contract

| Type             | Required columns                      | Optional columns              |
| ---------------- | ------------------------------------- | ----------------------------- |
| PRODUCTS         | item_name, type, selling_price        | category, cost_price          |
| SALES            | date, item_name, quantity, unit_price | unit_cost, total_amount, note |
| EXPENSES         | date, category, amount                | description                   |
| CUSTOMER_METRICS | date, customer_count                  | —                             |
| FEEDBACK         | date, feedback_text                   | —                             |

Headings are trimmed and lowercased; spaces/hyphens become underscores. Unexpected, duplicate, empty, or missing required headings reject the file. The first row must contain headings. UTF-8 CSV uses commas and standard quoted commas/newlines; malformed quoting rejects the file. Empty data rows are ignored. CSV row numbers identify logical records (a quoted multiline field is one record); XLSX row numbers identify worksheet rows.

Dates use YYYY-MM-DD and must exist in the calendar. Date-formatted Excel numeric cells are converted using their 1900/1904 date system; fictional 1900-02-29 and time fractions are rejected. Unformatted serial numbers are not guessed to be dates. Preview shows normalized dates. No browser timezone shift is applied. All amounts use the selected business currency; there is no currency conversion.

Enter numbers with a decimal point and no thousands separators or currency symbols. Decimal strings remain exact; XLSX numeric values are read from their original XML numeric text before conversion to the existing Decimal rules. Existing record schemas enforce amount/quantity/text bounds. Scientific notation in CSV text is rejected; actual numeric XLSX cells are normalized to decimal text. Formulas are never evaluated or replaced with their cached results: their rows are invalid. Feedback and other values render as escaped text.

## Approved matching and accounting policies

- Product/service type is PRODUCT or SERVICE (case-insensitive). Names already in the catalog, including archived items, are invalid. All repeated case-insensitive names within the same file are invalid. Import does not update existing products. New items are active.
- A sale represents one complete single-item transaction. Its name must uniquely match an active product/service in that business after trimming and ignoring case. Unknown/ambiguous names are invalid. Item ID/name are resolved on the server. Historical unit_cost comes from the file; blank means unknown and zero means known zero. Current catalog cost is never substituted. Quantity × unit_price is rounded half-up to the currency's minor units; optional total_amount must equal that result.
- Expense categories must exist already. Their classification is snapshotted at import. Inventory purchases and Other spending are disclosed separately from Operating expenses; profit remains Revenue − known COGS − Operating Expenses. Missing costs reduce the dashboard's displayed coverage.
- Customer visits require one nonnegative integer total per date. Every repeated date within a file is invalid; existing dates must be edited through the regular form and cannot be replaced by imports.
- Feedback is stored as UNKNOWN/PENDING until the later analysis phase. No AI requests occur during imports.
- Negative adjustments/refunds remain deferred. Identical sale/expense/feedback rows receive a warning but remain separate records: equal values alone cannot distinguish duplicates from legitimate repeated transactions.

## Preview, confirmation and history

Preview is read-only. The server parses the file and validates rows against an authorized, consistent database snapshot. It returns all bounded rows for client pagination, resolved sales/category details, warnings, valid/invalid counts, and a signed preview token expiring in 15 minutes. No raw file is persisted. The browser keeps the selected file only for re-upload on confirmation; refreshing the page requires choosing it again.

The signature binds the actor, business, type, file hash and reviewed results. Confirmation requires `confirmed=true`, authenticates and authorizes again, verifies the token, locks the owned business, revalidates the original bytes, and compares the review hash. Relevant changes require a fresh preview. Client-supplied normalized rows, totals, classifications and ownership fields are never accepted. Monetary imports call the permanent currency/timezone lock helper in the same transaction.

All valid rows and one DataImport history record commit atomically. Expected invalid rows are skipped only after explicit confirmation, with row numbers and validation reasons retained. An unexpected insert failure rolls back the rows, history and new financial-settings marker. COMPLETED means every row imported; PARTIAL means some invalid rows were skipped. Rejected files, abandoned previews, and zero-valid previews do not create history records.

A unique `(businessId, importType, fileHash)` constraint plus the business lock prevents duplicate confirmation. Repeating a successful signed confirmation returns its existing result, even if the token has subsequently expired. Re-previewing the exact same bytes, including under a new filename, directs the user to history. Different bytes are not semantic deduplication. **For a partial import, correct and upload only the skipped rows.** Re-uploading all rows in a changed file could duplicate successful sales, expenses or feedback.

History lists 20 imports per page and has owner-checked result pages. Counts describe the original import, not the current number of records after edits/deletions. Every imported record carries source=IMPORT and a business-scoped dataImportId; normal edits preserve provenance. Business deletion cascades through the whole graph. There is no separate undo/import-delete operation in this phase.

## Resource limits and workbook restrictions

- File size: 2 MiB; multipart body: 2 MiB + 64 KiB, enforced while streaming even without Content-Length.
- One file and one type per request; additional/repeated multipart fields rejected. Same-origin mutation checks and active-owner checks run before parsing.
- 1,000 data rows, 12 columns, 4,000 characters per cell before stricter field rules. XLSX populated/formatted cells must stay within rows 1–1001 and columns A–L.
- XLSX: exactly one visible worksheet, at most 100 ZIP entries, 4 MiB per expanded entry, 8 MiB total expanded XML, depth 40 and 150,000 XML nodes. Actual decompressed bytes are measured before ExcelJS loads the workbook; entries never extract to disk.
- Reject encrypted files, XLS/XLSM, macros, embedded objects, images, external links, XML document types/entities, named ranges, merged cells, data validation and conditional formatting. The range restrictions prevent small XML declarations from expanding into enormous cell allocations. Copy plain values into a clean template when an exported workbook contains these features.
- No persistent file storage, macros, formula execution, remote resource fetches, or automatic category/catalog creation. Synchronous work is bounded for the prototype; hosting request/time/memory limits must still be verified when deploying.

## Dependencies and evidence

Pinned Papa Parse 5.7.0 parses CSV with dynamicTyping=false; ExcelJS 4.4.0 reads/writes XLSX; yauzl 3.4.0 streams bounded ZIP entries; saxes 6.0.0 validates XML. Sources: [Papa Parse documentation](https://www.papaparse.com/docs), [ExcelJS](https://github.com/exceljs/exceljs), [yauzl](https://github.com/thejoshwolfe/yauzl), and [saxes](https://github.com/lddubeau/saxes).

ExcelJS is an older stable release with deprecated transitive packages; this is a maintenance tradeoff, not a claim that every transitive dependency is current. The ExcelJS-scoped uuid override uses CommonJS-compatible 11.1.1 to address [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). ExcelJS uses the supported v4 API; XLSX read/write tests and production compilation verify this integration. The installation audit reported zero vulnerabilities. Audit status is a point-in-time check, not a guarantee. Reassess pinned dependencies before deployment.
