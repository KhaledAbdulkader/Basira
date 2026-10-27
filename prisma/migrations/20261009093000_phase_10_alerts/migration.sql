BEGIN;
CREATE TYPE "AlertType" AS ENUM ('SALES_DROP', 'EXPENSE_INCREASE', 'LOW_PROFIT_MARGIN', 'NEGATIVE_FEEDBACK', 'FORECAST_DROP');
CREATE TYPE "AlertStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED');
CREATE TYPE "AlertSeverity" AS ENUM ('WARNING');
CREATE TABLE "AlertRule" (
  "id" TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" "AlertType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "threshold" DECIMAL(7,2) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AlertRule_version_check" CHECK ("version" > 0),
  CONSTRAINT "AlertRule_threshold_check" CHECK (
    ("type" IN ('SALES_DROP', 'FORECAST_DROP') AND "threshold" BETWEEN 0.01 AND 100) OR
    ("type" = 'EXPENSE_INCREASE' AND "threshold" BETWEEN 0.01 AND 1000) OR
    ("type" IN ('LOW_PROFIT_MARGIN', 'NEGATIVE_FEEDBACK') AND "threshold" BETWEEN 0 AND 100)
  )
);
CREATE UNIQUE INDEX "AlertRule_businessId_type_key" ON "AlertRule"("businessId", "type");
CREATE UNIQUE INDEX "AlertRule_businessId_id_key" ON "AlertRule"("businessId", "id");
CREATE TABLE "Alert" (
  "id" TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "ruleId" TEXT,
  "type" "AlertType" NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "AlertStatus" NOT NULL DEFAULT 'UNREAD',
  "fingerprint" CHAR(64) NOT NULL,
  "periodFrom" DATE NOT NULL,
  "periodTo" DATE NOT NULL,
  "evidence" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ(3),
  "dismissedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Alert_rule_fkey" FOREIGN KEY ("businessId", "ruleId") REFERENCES "AlertRule"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "Alert_version_check" CHECK ("version" > 0),
  CONSTRAINT "Alert_fingerprint_check" CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "Alert_period_check" CHECK ("periodTo" >= "periodFrom" AND "periodTo" - "periodFrom" < 366),
  CONSTRAINT "Alert_evidence_check" CHECK (jsonb_typeof("evidence") = 'object'),
  CONSTRAINT "Alert_content_check" CHECK (length(trim("title")) > 0 AND length(trim("message")) > 0),
  CONSTRAINT "Alert_status_check" CHECK (
    ("status" = 'UNREAD' AND "readAt" IS NULL AND "dismissedAt" IS NULL) OR
    ("status" = 'READ' AND "readAt" IS NOT NULL AND "dismissedAt" IS NULL) OR
    ("status" = 'DISMISSED' AND "dismissedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "Alert_businessId_fingerprint_key" ON "Alert"("businessId", "fingerprint");
CREATE INDEX "Alert_businessId_createdAt_id_idx" ON "Alert"("businessId", "createdAt", "id");
CREATE INDEX "Alert_businessId_status_createdAt_id_idx" ON "Alert"("businessId", "status", "createdAt", "id");
CREATE INDEX "Alert_businessId_ruleId_idx" ON "Alert"("businessId", "ruleId");
INSERT INTO "AlertRule" ("id", "businessId", "type", "threshold", "updatedAt")
SELECT 'c' || substr(md5(b."id" || ':' || r.type), 1, 24), b."id", r.type::"AlertType", r.threshold, CURRENT_TIMESTAMP
FROM "Business" b CROSS JOIN (VALUES
  ('SALES_DROP', 20), ('EXPENSE_INCREASE', 20), ('LOW_PROFIT_MARGIN', 10),
  ('NEGATIVE_FEEDBACK', 40), ('FORECAST_DROP', 15)
) AS r(type, threshold);
COMMIT;
