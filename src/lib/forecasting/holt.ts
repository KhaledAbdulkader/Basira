import { Decimal, currencyPrecision } from "@/lib/records/money";

type Amount = InstanceType<typeof Decimal>;
export const ALGORITHM_VERSION = "HOLT_LINEAR_V1";
export const MAX_FORECAST_AMOUNT = "1e24";
export type HoltState = { level: Amount; trend: Amount };
export type HoltParameters = { alpha: string; beta: string };

function amounts(values: readonly string[]) {
  if (values.length < 3 || values.length > 366)
    throw new Error("Use 3–366 daily observations.");
  return values.map((value) => {
    const amount = new Decimal(value);
    if (
      !amount.isFinite() ||
      amount.isNegative() ||
      amount.gte(MAX_FORECAST_AMOUNT)
    )
      throw new Error("Historical amount exceeds the forecasting range.");
    return amount;
  });
}
function parameters(input: HoltParameters) {
  const alpha = new Decimal(input.alpha),
    beta = new Decimal(input.beta);
  if (
    ![alpha, beta].every(
      (value) => value.isFinite() && value.gte(0) && value.lte(1),
    )
  )
    throw new Error("Smoothing parameters must be between zero and one.");
  return { alpha, beta };
}
function smooth(values: Amount[], alpha: Amount, beta: Amount) {
  let level = values[0]!,
    trend = values[1]!.minus(values[0]!);
  let sse = new Decimal(0);
  const oneMinusAlpha = new Decimal(1).minus(alpha),
    oneMinusBeta = new Decimal(1).minus(beta);
  for (let i = 1; i < values.length; i++) {
    const predicted = level.plus(trend);
    // y[1] initializes the trend; exclude its artificial zero residual from SSE.
    if (i > 1) sse = sse.plus(values[i]!.minus(predicted).pow(2));
    const nextLevel = alpha
      .times(values[i]!)
      .plus(oneMinusAlpha.times(predicted));
    trend = beta.times(nextLevel.minus(level)).plus(oneMinusBeta.times(trend));
    level = nextLevel;
  }
  return { level, trend, sse };
}
export function fitHolt(
  values: readonly string[],
  input: HoltParameters,
): HoltState {
  const { alpha, beta } = parameters(input);
  const { level, trend } = smooth(amounts(values), alpha, beta);
  return { level, trend };
}
export function estimateHolt(values: readonly string[]): HoltParameters {
  const observations = amounts(values);
  let best = { alpha: "0", beta: "0" };
  let score: Amount | null = null;
  // Fixed bounded grid, stable tie-breaking: lowest alpha, then lowest beta.
  // Parameter selection never receives held-out observations.
  for (let a = 0; a <= 10; a++)
    for (let b = 0; b <= 10; b++) {
      const alpha = new Decimal(a).div(10),
        beta = new Decimal(b).div(10);
      const { sse } = smooth(observations, alpha, beta);
      if (score === null || sse.lt(score)) {
        score = sse;
        best = { alpha: alpha.toFixed(), beta: beta.toFixed() };
      }
    }
  return best;
}
export function projectHolt(state: HoltState, horizon: number) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 124)
    throw new Error("Unsupported daily forecast horizon.");
  return Array.from({ length: horizon }, (_, index) => {
    const value = state.level.plus(state.trend.times(index + 1));
    if (!value.isFinite() || value.gte(MAX_FORECAST_AMOUNT))
      throw new Error("Prediction exceeds the supported forecasting range.");
    return { value: Decimal.max(0, value).toFixed(), clamped: value.lt(0) };
  });
}
export function forecastErrors(
  actual: readonly string[],
  predicted: readonly string[],
) {
  if (!actual.length || actual.length !== predicted.length)
    throw new Error(
      "Actual and predicted observations must have equal nonzero lengths.",
    );
  let absolute = new Decimal(0),
    percentage = new Decimal(0),
    nonzero = 0;
  for (let i = 0; i < actual.length; i++) {
    const a = new Decimal(actual[i]!),
      p = new Decimal(predicted[i]!);
    if (!a.isFinite() || !p.isFinite() || a.lt(0) || p.lt(0))
      throw new Error("Error metrics require finite nonnegative amounts.");
    const error = a.minus(p).abs();
    absolute = absolute.plus(error);
    if (!a.isZero()) {
      percentage = percentage.plus(error.div(a));
      nonzero++;
    }
  }
  return {
    mae: absolute.div(actual.length).toFixed(),
    mape: nonzero ? percentage.div(nonzero).times(100).toFixed() : null,
    mapeSamples: nonzero,
    zeroActuals: actual.length - nonzero,
  };
}
export function evaluateHolt(values: readonly string[], testDays: number) {
  amounts(values);
  if (
    !Number.isInteger(testDays) ||
    testDays < 1 ||
    values.length - testDays < 3 ||
    testDays > 90
  )
    throw new Error("Not enough training observations for this holdout.");
  const training = values.slice(0, -testDays),
    actual = values.slice(-testDays);
  const parameters = estimateHolt(training);
  const predictions = projectHolt(fitHolt(training, parameters), testDays);
  const baseline = actual.map(() => training.at(-1)!);
  return {
    parameters,
    trainingCount: training.length,
    testCount: testDays,
    actual,
    predicted: predictions.map((point) => point.value),
    baseline,
    errors: forecastErrors(
      actual,
      predictions.map((point) => point.value),
    ),
    baselineErrors: forecastErrors(actual, baseline),
    clamped: predictions.filter((point) => point.clamped).length,
  };
}
export function forecastMoney(value: string, currency: string) {
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.lt(0) || amount.gte(MAX_FORECAST_AMOUNT))
    throw new Error("Forecast amount exceeds the supported range.");
  return amount
    .toDecimalPlaces(currencyPrecision(currency), Decimal.ROUND_HALF_UP)
    .toFixed();
}
