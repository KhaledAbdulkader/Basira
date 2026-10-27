BEGIN;
ALTER TABLE "Business" ADD COLUMN "feedbackAnalysisNextAt" TIMESTAMPTZ(3);
ALTER TABLE "CustomerFeedback"
  ADD COLUMN "analysisProvider" VARCHAR(32),
  ADD COLUMN "analysisModel" VARCHAR(120),
  ADD COLUMN "analysisPromptVersion" VARCHAR(40),
  ADD COLUMN "analyzedAt" TIMESTAMPTZ(3),
  ADD COLUMN "analysisError" VARCHAR(32),
  ADD COLUMN "analysisAttemptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "analysisAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "analysisLeaseToken" VARCHAR(36),
  ADD COLUMN "analysisLeaseUntil" TIMESTAMPTZ(3);
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_analysis_attempts_check" CHECK ("analysisAttempts" >= 0);
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_analysis_lease_check" CHECK (
  ("analysisLeaseToken" IS NULL) = ("analysisLeaseUntil" IS NULL)
  AND ("analysisLeaseToken" IS NULL OR "analysisStatus" = 'PENDING')
);
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_analysis_error_check" CHECK (
  "analysisError" IS NULL OR ("analysisStatus" = 'FAILED' AND "analysisError" IN
    ('CONFIGURATION','TIMEOUT','RATE_LIMIT','UNAVAILABLE','INVALID_RESPONSE','REFUSED'))
);
CREATE INDEX "CustomerFeedback_businessId_analysisStatus_feedbackDate_id_idx"
  ON "CustomerFeedback"("businessId", "analysisStatus", "feedbackDate", "id");
COMMIT;
