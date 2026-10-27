# Basira manual testing checklist

Use [http://localhost:3000](http://localhost:3000). This is the application preview; port 3100 is reserved for automated tests. If the preview is stopped, run `npm run dev` from the project folder. PostgreSQL must also be running.

There are two useful paths: use the fictional demo account to explore populated pages, then create your own account and a disposable business to verify exact numbers. The PostgreSQL role `basira_local` is not a website login.

## 1. Explore the demo (about 10 minutes)

The demo account is `demo@basira.example`. Its generated password is in the ignored local file `.local/demo-access.json`. Open that file privately; do not put its contents in screenshots or bug reports. If it has not been seeded, run `npm run db:seed:demo -- --local` once after `npm run db:deploy`.

| Action                                                                  | Expected result                                                                                                                           |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in and select **Olive & Oak Cafe (Demo)** in the business switcher | Overview shows sales, expenses, profit estimates, charts and coverage.                                                                    |
| Choose 7, 30 and 90 days; apply each period                             | Values and dates change together; the preceding-period comparison is labeled.                                                             |
| Expand chart data and cost-coverage details                             | Tables agree with charts; some missing sale costs are disclosed. Inventory and Other spending are separate from operating expenses.       |
| Open Sales, Expenses, Products & Services and Customer Metrics          | Records are populated, dated and paginated. One sale is one transaction for one product; customer totals count visits, including repeats. |
| Select **Clearline Design Studio (Demo)**                               | Every business-scoped page changes to the studio. Cafe records do not remain selected or leak into its totals.                            |
| Return to the cafe and refresh                                          | The selected business and stored data remain available.                                                                                   |

The cafe has 210 completed days of history; the studio has 21. Data is fixed at first creation, not refreshed on every login. For an older seed, use a custom period within its recorded dates. Seeding again preserves edits and passwords and does not append duplicate records. See [DEMO.md](DEMO.md).

## 2. Registration and account access

1. Sign out. Choose **Create an account** and use a new test email, name and a password of at least 12 characters.
2. Try an invalid email and a short password first. Expect readable validation and no account creation.
3. Register valid details, then sign in. Try a wrong password once; expect a generic failure without technical details.
4. Refresh after signing in. Expect your session to persist.
5. In a private/incognito window, open `/sales` before signing in. Expect the login page.
6. Sign out and revisit a private page. Expect login again.

Google sign-in is a separate check: its credentials were deferred. A disabled Google button is expected while unconfigured. Once configured, test a new Google identity, logout and returning sign-in. An existing password account with the same email must not be silently linked to Google. See [AUTHENTICATION.md](AUTHENTICATION.md).

## 3. Businesses and exact financial values

Create **Manual QA Cafe** under your own test account. Choose Cafe, SAR and Asia/Riyadh. Create a second empty business, **Manual QA Studio**, to test switching and empty states. The following numbers belong only in the new empty cafe.

Use the same date for all entries and select that exact date in Overview's **Custom** period. Keep the date within the allowed entry range; today's date is fine for dashboard testing.

| Step                     | What to enter                                                                     | Expected result                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product                  | **QA Coffee**, product, selling price **25**, cost price **10**, active           | Product saves and is available when adding a sale.                                                                                                                        |
| Sale                     | QA Coffee, quantity **2**, unit price **25**, use catalog cost **10**             | One transaction; revenue **SAR 50.00**, COGS **SAR 20.00**.                                                                                                               |
| Operating expense        | Default **Supplies** category, amount **5**                                       | Operating expenses **SAR 5.00**; estimated profit **SAR 25.00**.                                                                                                          |
| Inventory expense        | Default **Inventory** category, amount **100**                                    | Total expenses **SAR 105.00**, inventory **SAR 100.00**; estimated profit stays **SAR 25.00**. Inventory is not deducted twice.                                           |
| Other expense (optional) | **Other** category, amount **7**                                                  | Other spending is disclosed separately; estimated operating profit remains **SAR 25.00**.                                                                                 |
| Visits                   | Daily customer count **8**                                                        | Eight visits for that date. Adding the same date again should require editing the existing daily total.                                                                   |
| Unknown-cost sale        | Another sale for **20**, quantity **1**, explicitly leave historical cost unknown | Revenue **SAR 70.00**, known COGS **SAR 20.00**, estimated profit **SAR 45.00**. Only one of two sales has known cost: **50%** coverage. The result is clearly estimated. |

After the basic calculation, test these variations individually and check the resulting totals:

- Edit the first sale from quantity 2 to 3. Revenue rises by 25, known COGS rises by 10 and profit rises by 15.
- Change QA Coffee's catalog cost. The historical unit cost of the already-saved sale must remain 10.
- Try negative quantities, a negative expense, and an empty required field. Expect validation with no extra record created. Refunds/negative adjustments are outside the approved scope.
- Cancel a record deletion. Nothing changes. Then confirm deletion of a disposable entry and verify its removal from the list and dashboard.
- Try changing currency or timezone after priced products/financial records exist. Expect a locked setting; historical amounts must never be relabeled as another currency.
- Switch to Manual QA Studio. It should have an empty dashboard and no cafe records.
- Log into a different ordinary account in a private window. Copy a business-specific API/detail URL from the first account; it must not return that business's data.

## 4. Imports

Use your disposable business rather than the main demo if you want to keep demo totals intact.

1. Open **Imports**, select a data type, and download its CSV or Excel template. Follow the provided headers and date formats.
2. For sales, use an existing active item name such as QA Coffee. For expenses, use an existing category such as Supplies so its classification is known.
3. Fill two valid rows and one deliberately invalid row (unknown item/category, invalid date or negative value).
4. Upload. Expect a preview with row-specific errors, counts and valid values. **Preview alone must not save records.**
5. Confirm the valid rows using the review controls. Expect only those rows to appear in records and import history. Check the dashboard for the imported dates.
6. Upload the same completed file again. It should not create duplicate records.
7. Repeat with the other file format. Try a product name already in the catalog: it should be invalid rather than overwriting the product.

Avoid formulas in Excel cells. The app intentionally rejects formula cells, oversized files (over 2 MiB), and more than 1,000 data rows. See [IMPORTS.md](IMPORTS.md) for exact headers and rules.

## 5. Forecasts

1. Select the demo cafe and open **Forecasts**. Choose Revenue and **Next 7 days**, review the history, then generate.
2. Repeat for **Next 30 days** and **Next 3 months**. Expect 7 daily points, 30 daily points, and three full calendar-month totals respectively.
3. Check history dates, currency, MAE/MAPE, charts and saved results. Refresh and reopen a saved forecast; it should persist.
4. Try Expense forecasting as well. This uses all recorded expense classifications, unlike the operating-profit calculation.
5. Switch to the studio or an empty business and select Next 3 months. Expect an insufficient-history explanation, not an invented forecast.
6. If dates are missing, generation must require explicit confirmation that those dates mean zero activity. Only confirm if that is true. Studio Sundays are intentional zero activity in the synthetic data; later dates after the seed are not automatically known zeros.

Forecasting uses completed dates before today and does not need NVIDIA or Google. Newly entered data for today is excluded from forecast training. A synthetic forecast is not a claim about a real business.

## 6. Feedback and AI Assistant

1. Add a positive and a negative comment under **Customer Feedback**, using no real customer identifiers. Expect them to save as awaiting analysis.
2. If live AI is configured and reachable, analyze them. Expect sentiment/topics or a clear recoverable error; original comments must remain saved.
3. Open **AI Assistant** and ask: “Summarize my selected business's revenue, operating expenses and estimated profit for this period.” Check cited dates and amounts against Overview.
4. Ask: “Write me a poem about space.” Expect the app's standard out-of-scope response. This is an AI classification check, so record any failure.
5. Refresh and reopen the conversation. It should persist under the same business. Switching businesses must show separate history.

The prior live NVIDIA requests timed out. A key being present does not prove the endpoint is working. Log live AI results as **Passed**, **Failed**, or **Blocked by provider**; do not treat mocked automated results as a successful live request. The seed does not invent analyzed feedback or assistant messages.

## 7. Alerts

1. Select the demo cafe and open **Alerts**. Refresh/evaluate as offered. The recent drop in recorded revenue should produce a sales-drop alert while the seeded period is current.
2. Inspect the alert's dates, threshold and underlying values. These should agree with its saved evidence.
3. Mark an alert read and dismiss a disposable alert. Verify the unread indicator changes and the filters work.
4. Evaluate again without changing data/rules. Expect no duplicate alert for the same evidence.
5. Edit a threshold in the alert-rule settings, save, refresh and confirm it persists.

Missing historical costs intentionally prevent the low-profit-margin rule from making a confident profit alert. Negative-feedback alerts require enough genuinely analyzed comments. Not every alert type should appear immediately.

## 8. Reports and PDFs

1. Open **Reports**, create a report for a period containing your manual entries or demo records. Try weekly, monthly and custom periods.
2. Verify revenue, COGS, operating expenses, profit, coverage, dates and business name. Without AI, a deterministic written summary should still appear.
3. Download the PDF. Open it and check that text, tables, currency, page breaks and any Arabic names are readable and not clipped.
4. Edit a source sale after saving the report. Reopen the old report: its saved values must stay unchanged. A new report should reflect the edit.
5. Refresh the report list and confirm history persists. Optional AI executive summaries are a separate live-provider check.

## 9. Appearance, keyboard and mobile

- Toggle light and dark themes, then refresh. Theme preference should persist and text should remain readable.
- Resize to phone width, or use browser device tools. Open/close the navigation drawer. Check that forms, charts, tables and dialogs fit without page-wide horizontal scrolling.
- Use Tab, Shift+Tab and Enter without the mouse. Focus should be visible; the skip link should reach main content.
- Open a form dialog, press Escape and verify focus returns to its opening button.
- Visit a nonexistent path. Expect a helpful 404, not a server error or secret data.

## 10. Administration (only after explicit setup)

The demo owner is a normal USER and should not see Admin. Directly opening `/admin` as that user must be denied. Full admin testing needs an explicitly chosen registered account provisioned using the operator instructions in [ADMINISTRATION.md](ADMINISTRATION.md); no default admin is supplied.

With that administrator, check statistics, directory search, paging and a disposable account's suspend/reactivate flow. A suspended user's existing session must lose access, and reactivation should preserve its records. Administrators must still not see another owner's private sales, feedback or chats.

## Recording problems

### Hydration warning with `bis_skin_checked` or `bis_register`

These extra attributes can be injected by a browser extension before React starts. In the reported 2026-10-13 login warning, the partially recorded extension ID matches [Urban VPN Proxy](https://chromewebstore.google.com/detail/urban-vpn-proxy/eppiocemhmnlbhjplcgkofciiegomcon). The attributes were absent from Basira's server response and the connected in-app browser. See [Next.js hydration troubleshooting](https://nextjs.org/docs/messages/react-hydration-error) for extension-induced mismatches.

In the browser showing the error, open Extensions → Manage extensions and temporarily turn off Urban VPN, then return to `http://localhost:3000/login` and press Ctrl+Shift+R. Alternatively, restrict its site access so it cannot run on localhost, or use a private window with the extension disabled there. [Chrome's extension-management instructions](https://support.google.com/chrome_webstore/answer/2664769?hl=en) explain these controls. Disconnecting a VPN tunnel alone may leave its page-modifying content script enabled.

If the warning persists, check the new mismatch for another extension attribute and test in a clean browser profile. Do not disable server rendering or blanket-suppress hydration warnings: that would hide genuine application mismatches and would not remove the extension's changes. The root `<html>` suppression is specifically for the existing theme class; it is not a remedy for injected attributes throughout the page.

For each check, record **Passed / Failed / Blocked**, the selected business, date filter, browser and theme. For a failure include:

```text
Page:
Business and date range:
Steps:
Expected result:
Actual result:
Screenshot or exact visible error (remove passwords, keys and private data):
```

Save destructive checks for disposable records/businesses. Do not delete the populated demo businesses unless you intend to remove their history; the seed deliberately does not rebuild or reset an existing demo owner.
