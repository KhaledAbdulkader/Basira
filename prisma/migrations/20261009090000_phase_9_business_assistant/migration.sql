BEGIN;
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "ChatMessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
ALTER TABLE "Business" ADD COLUMN "assistantNextAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "Business_id_ownerId_key" ON "Business"("id", "ownerId");
CREATE TABLE "ChatConversation" (
  "id" TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL DEFAULT 'New conversation',
  "periodFrom" DATE NOT NULL,
  "periodTo" DATE NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ChatConversation_businessId_userId_fkey" FOREIGN KEY ("businessId", "userId") REFERENCES "Business"("id", "ownerId") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatConversation_bounds_check" CHECK ("version" > 0 AND "messageCount" BETWEEN 0 AND 100 AND "messageCount" % 2 = 0 AND "periodTo" >= "periodFrom" AND "periodTo" - "periodFrom" < 366)
);
CREATE INDEX "ChatConversation_businessId_userId_updatedAt_id_idx" ON "ChatConversation"("businessId", "userId", "updatedAt", "id");
CREATE TABLE "ChatMessage" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "turnId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" "ChatRole" NOT NULL,
  "content" VARCHAR(4000) NOT NULL,
  "status" "ChatMessageStatus" NOT NULL,
  "inScope" BOOLEAN,
  "referencedMetrics" JSONB,
  "warnings" JSONB,
  "context" JSONB,
  "errorCode" VARCHAR(32),
  "provider" VARCHAR(32),
  "model" VARCHAR(120),
  "promptVersion" VARCHAR(40),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" VARCHAR(36),
  "leaseUntil" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatMessage_bounds_check" CHECK ("sequence" BETWEEN 1 AND 100 AND "attempts" >= 0),
  CONSTRAINT "ChatMessage_role_check" CHECK (
    ("role" = 'USER' AND "sequence" % 2 = 1 AND "status" = 'COMPLETED' AND length(btrim("content")) BETWEEN 1 AND 2000 AND "inScope" IS NULL AND "context" IS NULL AND "attempts" = 0)
    OR ("role" = 'ASSISTANT' AND "sequence" % 2 = 0 AND (("status" = 'COMPLETED' AND length(btrim("content")) > 0 AND "inScope" IS NOT NULL) OR ("status" <> 'COMPLETED' AND "content" = '' AND "inScope" IS NULL)))
  ),
  CONSTRAINT "ChatMessage_lease_check" CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL) AND ("leaseToken" IS NULL OR ("role" = 'ASSISTANT' AND "status" = 'PENDING'))),
  CONSTRAINT "ChatMessage_error_check" CHECK ("errorCode" IS NULL OR ("status" = 'FAILED' AND "errorCode" IN ('CONFIGURATION','TIMEOUT','RATE_LIMIT','UNAVAILABLE','INVALID_RESPONSE','REFUSED')))
);
CREATE UNIQUE INDEX "ChatMessage_conversationId_sequence_key" ON "ChatMessage"("conversationId", "sequence");
CREATE UNIQUE INDEX "ChatMessage_conversationId_turnId_role_key" ON "ChatMessage"("conversationId", "turnId", "role");
CREATE INDEX "ChatMessage_status_leaseUntil_idx" ON "ChatMessage"("status", "leaseUntil");
COMMIT;
