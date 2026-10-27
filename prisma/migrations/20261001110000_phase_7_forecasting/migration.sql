BEGIN;
-- CreateEnum
CREATE TYPE "ForecastMetric" AS ENUM ('REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ForecastHorizon" AS ENUM ('DAYS_7', 'DAYS_30', 'MONTHS_3');

-- CreateEnum
CREATE TYPE "ForecastGranularity" AS ENUM ('DAY', 'MONTH');

-- CreateTable
CREATE TABLE "ForecastRun" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "metricType" "ForecastMetric" NOT NULL,
    "horizon" "ForecastHorizon" NOT NULL,
    "algorithm" VARCHAR(40) NOT NULL,
    "granularity" "ForecastGranularity" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "historyHash" CHAR(64) NOT NULL,
    "trainingStart" DATE NOT NULL,
    "trainingEnd" DATE NOT NULL,
    "forecastStart" DATE NOT NULL,
    "forecastEnd" DATE NOT NULL,
    "recordedDays" INTEGER NOT NULL,
    "gapDays" INTEGER NOT NULL,
    "gapsConfirmed" BOOLEAN NOT NULL,
    "alpha" DECIMAL(3,2) NOT NULL,
    "beta" DECIMAL(3,2) NOT NULL,
    "trainingCount" INTEGER NOT NULL,
    "backtestCount" INTEGER NOT NULL,
    "mae" DECIMAL(38,8) NOT NULL,
    "mape" DECIMAL(38,8),
    "mapeSamples" INTEGER NOT NULL,
    "baselineMae" DECIMAL(38,8) NOT NULL,
    "clampedCount" INTEGER NOT NULL,
    "total" DECIMAL(38,4) NOT NULL,
    "history" JSONB NOT NULL,
    "dailyForecast" JSONB NOT NULL,
    "backtest" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastPoint" (
    "id" TEXT NOT NULL,
    "forecastRunId" TEXT NOT NULL,
    "forecastDate" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "predictedValue" DECIMAL(38,4) NOT NULL,
    "lowerBound" DECIMAL(38,4),
    "upperBound" DECIMAL(38,4),

    CONSTRAINT "ForecastPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForecastRun_businessId_createdAt_id_idx" ON "ForecastRun"("businessId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastRun_businessId_metricType_horizon_algorithm_history_key" ON "ForecastRun"("businessId", "metricType", "horizon", "algorithm", "historyHash");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastPoint_forecastRunId_forecastDate_key" ON "ForecastPoint"("forecastRunId", "forecastDate");

-- AddForeignKey
ALTER TABLE "ForecastRun" ADD CONSTRAINT "ForecastRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastPoint" ADD CONSTRAINT "ForecastPoint_forecastRunId_fkey" FOREIGN KEY ("forecastRunId") REFERENCES "ForecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForecastRun" ADD CONSTRAINT "ForecastRun_contract_check" CHECK (
  "trainingStart" >= DATE '1000-01-01' AND "trainingEnd" >= "trainingStart"
  AND "trainingEnd" - "trainingStart" < 366
  AND "forecastStart" > "trainingEnd" AND "forecastEnd" >= "forecastStart" AND "forecastEnd" <= DATE '9999-12-31'
  AND "recordedDays" + "gapDays" = "trainingEnd" - "trainingStart" + 1
  AND "gapDays" >= 0 AND ("gapDays" = 0 OR "gapsConfirmed")
  AND "trainingCount" >= 3 AND "trainingCount" + "backtestCount" = "recordedDays" + "gapDays"
  AND (("horizon" = 'DAYS_7' AND "recordedDays" >= 14 AND "backtestCount" = 7 AND "granularity" = 'DAY' AND "forecastEnd" - "forecastStart" = 6)
    OR ("horizon" = 'DAYS_30' AND "recordedDays" >= 60 AND "backtestCount" = 30 AND "granularity" = 'DAY' AND "forecastEnd" - "forecastStart" = 29)
    OR ("horizon" = 'MONTHS_3' AND "recordedDays" >= 180 AND "backtestCount" = 90 AND "granularity" = 'MONTH' AND "forecastEnd" - "forecastStart" BETWEEN 88 AND 91))
  AND "alpha" BETWEEN 0 AND 1 AND "beta" BETWEEN 0 AND 1
  AND "mae" >= 0 AND "mae" < 1e24 AND "baselineMae" >= 0 AND "baselineMae" < 1e24
  AND (("mapeSamples" = 0 AND "mape" IS NULL) OR ("mapeSamples" > 0 AND "mape" >= 0 AND "mape" < 1e30))
  AND "mapeSamples" BETWEEN 0 AND "backtestCount"
  AND "clampedCount" BETWEEN 0 AND "forecastEnd" - "forecastStart" + 1
  AND "total" >= 0 AND "total" < 1e26 AND "historyHash" ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof("history") = 'array' AND jsonb_array_length("history") = "recordedDays" + "gapDays"
  AND jsonb_typeof("backtest") = 'array' AND jsonb_array_length("backtest") = "backtestCount"
  AND jsonb_typeof("dailyForecast") = 'array' AND jsonb_array_length("dailyForecast") = "forecastEnd" - "forecastStart" + 1
);
ALTER TABLE "ForecastPoint" ADD CONSTRAINT "ForecastPoint_values_check" CHECK (
  "forecastDate" >= DATE '1000-01-01' AND "periodEnd" >= "forecastDate" AND "periodEnd" <= DATE '9999-12-31'
  AND "predictedValue" >= 0 AND "predictedValue" < 1e26
  AND (("lowerBound" IS NULL AND "upperBound" IS NULL) OR ("lowerBound" IS NOT NULL AND "upperBound" IS NOT NULL AND "lowerBound" >= 0 AND "lowerBound" <= "predictedValue" AND "upperBound" >= "predictedValue" AND "upperBound" < 1e26))
);
CREATE TRIGGER "ForecastRun_lock_business" BEFORE INSERT OR UPDATE ON "ForecastRun"
FOR EACH ROW EXECUTE FUNCTION lock_business_on_financial_write();
COMMIT;
