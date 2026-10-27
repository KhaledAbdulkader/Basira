# Forecasting (Phase 7)

Basira forecasts **revenue** and **all recorded expenses** using a deterministic local implementation of Holt's linear trend method. No AI service, external model, demo observations or prediction intervals are used. The feature supports Next 7 days, Next 30 days, and three full calendar-month totals. Forecasts are estimates of a recorded trend, not guaranteed outcomes.

## Data definition and eligibility

Revenue is the sum of stored sale totalAmount by saleDate. Expenses sum stored amount by expenseDate across OPERATING, INVENTORY_PURCHASE and OTHER. Expense forecasts represent spending, not COGS, operating expenses alone, or estimated profit. Missing sale unit costs do not affect revenue forecasting. Manual and imported records use the same aggregate queries.

The business timezone defines today. Query at most the last **366 completed calendar dates**, ending yesterday. Today's activity and future-dated records are excluded. The history starts at the earliest recorded date inside that window; dates before that first record are not padded. Multiple records on a date count as one recorded date. All aggregation is business-scoped PostgreSQL numeric arithmetic.

| Horizon       | Minimum distinct recorded dates | Final chronological holdout | Display                                           |
| ------------- | ------------------------------- | --------------------------- | ------------------------------------------------- |
| Next 7 days   | 14                              | 7 daily observations        | 7 daily amounts, starting tomorrow                |
| Next 30 days  | 60                              | 30 daily observations       | 30 daily amounts, starting tomorrow               |
| Next 3 months | 180                             | 90 daily observations       | 3 full calendar-month totals, starting next month |

These thresholds are conservative prototype eligibility rules, not statistical reliability guarantees. They apply to actual dates with financial records, so filling gaps cannot alone qualify a sparse history. A recorded zero-revenue sale remains a recorded observation. Expenses cannot be entered as zero under the approved normal-record rules, so sparse expense histories may remain ineligible. The user must add/import real historical records, not fake transactions to satisfy the threshold.

The user approved explicit confirmation of zero-activity gaps on 2026-10-01. The history review lists every missing date between the first record and yesterday. Generation requires an unchecked-by-default acknowledgment that **all listed dates** truly had zero revenue/expenses for the selected metric. If they are missing records, the user should add them and refresh the review. Confirmation applies only to that forecast snapshot: it creates no financial records and does not change dashboard data. A new review resets it. Recorded zero and confirmed zero gap retain different flags in stored history/backtest tables.

## Model equations and initialization

Let y_t be the daily observed amount, l_t the smoothed level, b_t the smoothed daily trend, and h the number of days after the model origin:

```text
l_t = alpha * y_t + (1 - alpha) * (l_(t-1) + b_(t-1))
b_t = beta * (l_t - l_(t-1)) + (1 - beta) * b_(t-1)
forecast_(t+h) = l_t + h * b_t
```

Both parameters lie in [0, 1]. Basira sets the initial level to the first training value and the initial trend to the second minus the first. It updates from the second observation onward. Because that second value initializes the trend, its artificial zero residual is excluded from parameter-selection loss.

The equations follow [Hyndman and Athanasopoulos, Forecasting: Principles and Practice, §8.2](https://otexts.com/fpp3/holt.html). Basira's fixed initialization and bounded search below are documented prototype choices, rather than a claim to reproduce an ETS maximum-likelihood implementation.

## Parameter fitting and backtesting

Reserve the last 7/30/90 observations as a single chronological holdout. Fit only on the earlier observations. Search the 121 combinations alpha,beta in {0, 0.1, ..., 1}, minimizing the sum of squared one-step training residuals. Ties select the smallest alpha, then beta, making runs reproducible. This coarse grid approximates a parameter search; it is not continuous optimization.

Forecast the complete held-out block from the training endpoint without updating states from its actual values. The holdout does not influence parameter selection or its own predictions. Compare against a naive baseline that repeats the final training-day value throughout the same holdout. Then update the final model state over the complete historical series using the already selected parameters and project future values. Retain the holdout predictions and errors as evaluation of the earlier fit; do not replace them with fitted residuals.

Holding later data out evaluates predictions on observations excluded from fitting, as explained in [FPP3 §5.8](https://otexts.com/fpp3/accuracy.html). Basira uses one holdout for a bounded, explainable prototype, rather than implementing repeated rolling-origin evaluation. That potential extension is described in [FPP3 §5.10](https://otexts.com/fpp3/tscv.html).

### Error metrics

```text
error_i = actual_i - predicted_i
MAE = sum(abs(error_i)) / number_of_holdout_days
MAPE_nonzero = 100 * mean(abs(error_i) / actual_i, over actual_i > 0)
```

MAE includes all holdout days, including zeros, and has the business currency's units. Conventional MAPE is undefined at zero actuals and unstable near zero ([FPP3 §5.8](https://otexts.com/fpp3/accuracy.html)). Basira explicitly labels its nonzero-only variant, reports the number included and excluded, and returns null/Not available if none qualify. It never presents MAPE as an accuracy percentage. Scores include owner-confirmed zero gaps; the UI discloses how many such dates are in the holdout. A baseline with lower MAE produces a visible caution rather than silently switching algorithms.

Negative model predictions are clamped to zero for both holdout evaluation and future amounts. The run records how many displayed daily predictions were clamped. Parameter selection uses the ordinary, unclamped training residuals. Error calculations use unrounded clamped predictions; displayed currency values may round them. MAE/MAPE are stored to eight decimal places. The 90-day holdout measures daily error, not errors in three calendar-month totals.

## Future dates, bridge days and monthly totals

The fitted state ends yesterday. For Next 7/30 days, the first displayed date is tomorrow, so today's unshown projection is one bridge step. For Next 3 months, project from yesterday through the last day of the third full future calendar month; skip today's remaining current-month bridge when displaying values and calculating totals. Leap years, December/January boundaries and variable month lengths use UTC calendar arithmetic on business-local date labels, not browser offsets or elapsed local hours.

Example: on 2026-10-01, history ends September 30. Next 7 days displays October 2–8 (model steps 2–8). Next 3 months displays November 1–January 31, totaling 92 daily estimates into November, December and January. A partial current month is not labeled a full month. Projection work is bounded to 124 steps.

Every displayed daily prediction is rounded half-up to the business currency's minor units. Month totals sum those rounded daily values exactly; run totals sum the saved displayed points. The result chart always compares daily values with daily values, with a gap before the selected future range. Monthly totals appear in a separate table. The chart shows at most the last 90 historical dates; an accessible table contains the full history.

## Precision, persistence and authorization

PostgreSQL numeric aggregates and the existing 40-significant-digit Decimal context handle money/model arithmetic. There is no binary Number conversion in fitting, totals or error calculations; only chart coordinates use Number. Individual daily observations/predictions must be finite, nonnegative and below 10^24. Exceeding the modeling range rejects generation rather than persisting invalid amounts. This is decimal numerical modeling, not a claim of exact real-number arithmetic after arbitrarily many recurrences.

An owner-authorized, read-only eligibility request returns counts, dates, gaps and a hash of the reviewed aggregate history, business/currency/timezone, options, dates and algorithm version. POST accepts only options, that hash and an explicit gap acknowledgment. It recomputes the history after locking the owned business, rejects changed reviews (including crossing business-local midnight), enforces eligibility, calculates the run, and saves ForecastRun plus ForecastPoint children atomically. All normal record/import mutations use the same business lock. Unexpected persistence failures roll back the entire run.

The same history/options/version hash reuses a stored run, preventing double-click/concurrent duplicates. A changed history or new business-local date creates a different run. Financial settings are permanently locked, including a database trigger for forecast writes. Active-owner checks apply to eligibility, generation, history and every result read; ADMIN does not bypass ownership. POST uses same-origin JSON with the existing 8 KiB body limit. Responses are no-store and sanitized on failure.

ForecastRun preserves currency/timezone, historical daily values and gap flags, daily projected values, holdout actual/predicted/baseline values, alpha/beta, date ranges, counts, errors, total, algorithm version and timestamp. ForecastPoint stores seven/thirty daily values or three monthly totals with explicit period ends. Bounds remain null because intervals are not implemented. Run history loads 20 metadata rows per page. No independent edit/delete endpoint is exposed; deleting the business cascades through its runs and points. Subsequent record edits never rewrite saved forecasts; the UI labels them as snapshots and offers fresh generation through the forecast workspace. Overview links to the latest saved result for the selected business with its total and explicit period; that snapshot is independent of dashboard date filters.

## Limitations and academic interpretation

Holt here models a changing level and linear trend, without weekly/yearly seasonality, holidays, causal features or damping. Sparse spending, outliers, structural breaks and long extrapolation can produce poor estimates. A trend can overstate long-term growth; clamping avoids impossible negative monetary values but does not repair model quality. A coarse parameter grid and one holdout are computational compromises. Error depends on the selected history and correctness of gap confirmations, and does not guarantee future accuracy. This phase intentionally does not attach statistical confidence claims or automatically generate alerts/recommendations from predictions.

See [PHASE_7_FORECASTING.md](PHASE_7_FORECASTING.md) for verification, [API.md](API.md) for endpoint contracts, and GP1 implementation change 20 for the approved clarifications and additional implementation choices.
