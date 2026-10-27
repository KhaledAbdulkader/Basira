BEGIN;
CREATE TYPE "ReportType" AS ENUM ('WEEKLY', 'MONTHLY', 'CUSTOM');
CREATE TYPE "ReportAiStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'COMPLETED', 'FAILED');
ALTER TABLE "Business" ADD COLUMN "reportSummaryNextAt" TIMESTAMPTZ(3);
CREATE TABLE "Report" (
  "id" TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestId" UUID NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "reportType" "ReportType" NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "businessName" VARCHAR(120) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "summary" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aiStatus" "ReportAiStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "aiSummary" VARCHAR(1800),
  "aiError" VARCHAR(32),
  "aiProvider" VARCHAR(32),
  "aiModel" VARCHAR(120),
  "aiPromptVersion" VARCHAR(40),
  "aiAttempts" INTEGER NOT NULL DEFAULT 0,
  "aiLeaseToken" UUID,
  "aiLeaseUntil" TIMESTAMPTZ(3),
  "aiCompletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Report_period_check" CHECK ("periodStart" >= DATE '1000-01-01' AND "periodEnd" <= DATE '9999-12-31' AND "periodEnd" - "periodStart" BETWEEN 0 AND 365),
  CONSTRAINT "Report_snapshot_check" CHECK (jsonb_typeof("snapshot") = 'object' AND "snapshot"->>'schemaVersion' = '1' AND octet_length("snapshot"::text) <= 131072),
  CONSTRAINT "Report_content_check" CHECK (length(trim("summary")) BETWEEN 1 AND 8000 AND length(trim("businessName")) > 0 AND "currency" ~ '^[A-Z]{3}$' AND "requestHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "Report_ai_check" CHECK ("aiAttempts" >= 0
    AND (("aiStatus" = 'PENDING' AND "aiLeaseToken" IS NOT NULL AND "aiLeaseUntil" IS NOT NULL) OR ("aiStatus" <> 'PENDING' AND "aiLeaseToken" IS NULL AND "aiLeaseUntil" IS NULL))
    AND (("aiStatus" = 'COMPLETED' AND "aiSummary" IS NOT NULL AND length(trim("aiSummary")) > 0 AND "aiCompletedAt" IS NOT NULL) OR ("aiStatus" <> 'COMPLETED' AND "aiSummary" IS NULL AND "aiCompletedAt" IS NULL))
    AND (("aiStatus" = 'FAILED' AND "aiError" IS NOT NULL AND "aiError" IN ('CONFIGURATION','TIMEOUT','RATE_LIMIT','UNAVAILABLE','INVALID_RESPONSE','REFUSED')) OR ("aiStatus" <> 'FAILED' AND "aiError" IS NULL)))
);
CREATE UNIQUE INDEX "Report_businessId_requestId_key" ON "Report"("businessId", "requestId");
CREATE INDEX "Report_businessId_createdAt_id_idx" ON "Report"("businessId", "createdAt", "id");
CREATE TRIGGER "Report_lock_business" BEFORE INSERT OR UPDATE ON "Report" FOR EACH ROW EXECUTE FUNCTION lock_business_on_financial_write();
CREATE FUNCTION protect_report_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."businessId",NEW."requestId",NEW."requestHash",NEW."reportType",NEW."periodStart",NEW."periodEnd",NEW."businessName",NEW."currency",NEW."timezone",NEW."summary",NEW."snapshot",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."businessId",OLD."requestId",OLD."requestHash",OLD."reportType",OLD."periodStart",OLD."periodEnd",OLD."businessName",OLD."currency",OLD."timezone",OLD."summary",OLD."snapshot",OLD."createdAt")
    OR (OLD."aiStatus" = 'COMPLETED' AND ROW(NEW."aiStatus",NEW."aiSummary",NEW."aiProvider",NEW."aiModel",NEW."aiPromptVersion",NEW."aiCompletedAt") IS DISTINCT FROM ROW(OLD."aiStatus",OLD."aiSummary",OLD."aiProvider",OLD."aiModel",OLD."aiPromptVersion",OLD."aiCompletedAt")) THEN
    RAISE EXCEPTION 'Saved report content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Report_protect_snapshot" BEFORE UPDATE ON "Report" FOR EACH ROW EXECUTE FUNCTION protect_report_snapshot();
COMMIT;
