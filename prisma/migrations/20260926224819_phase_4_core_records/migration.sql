BEGIN;

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "ExpenseClassification" AS ENUM ('OPERATING', 'INVENTORY_PURCHASE', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'ANALYZED', 'FAILED');

-- CreateTable
CREATE TABLE "ProductService" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "ProductType" NOT NULL,
    "category" VARCHAR(80),
    "costPrice" DECIMAL(19,4),
    "sellingPrice" DECIMAL(19,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalizedName" VARCHAR(80) NOT NULL,
    "classification" "ExpenseClassification" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productServiceId" TEXT,
    "itemName" VARCHAR(120),
    "saleDate" DATE NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4),
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "note" VARCHAR(1000),
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SalesRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "classification" "ExpenseClassification" NOT NULL,
    "expenseDate" DATE NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "description" VARCHAR(1000),
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExpenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMetric" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "metricDate" DATE NOT NULL,
    "customerCount" INTEGER NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "feedbackDate" DATE NOT NULL,
    "feedbackText" VARCHAR(2000) NOT NULL,
    "sentiment" "Sentiment" NOT NULL DEFAULT 'UNKNOWN',
    "topic" VARCHAR(120),
    "aiSummary" TEXT,
    "confidence" DECIMAL(5,4),
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductService_businessId_active_name_id_idx" ON "ProductService"("businessId", "active", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductService_businessId_id_key" ON "ProductService"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_businessId_id_key" ON "ExpenseCategory"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_businessId_normalizedName_key" ON "ExpenseCategory"("businessId", "normalizedName");

-- CreateIndex
CREATE INDEX "SalesRecord_businessId_saleDate_id_idx" ON "SalesRecord"("businessId", "saleDate", "id");

-- CreateIndex
CREATE INDEX "SalesRecord_businessId_productServiceId_idx" ON "SalesRecord"("businessId", "productServiceId");

-- CreateIndex
CREATE INDEX "ExpenseRecord_businessId_expenseDate_id_idx" ON "ExpenseRecord"("businessId", "expenseDate", "id");

-- CreateIndex
CREATE INDEX "ExpenseRecord_businessId_categoryId_idx" ON "ExpenseRecord"("businessId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMetric_businessId_metricDate_key" ON "CustomerMetric"("businessId", "metricDate");

-- CreateIndex
CREATE INDEX "CustomerFeedback_businessId_feedbackDate_id_idx" ON "CustomerFeedback"("businessId", "feedbackDate", "id");

-- AddForeignKey
ALTER TABLE "ProductService" ADD CONSTRAINT "ProductService_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_businessId_productServiceId_fkey" FOREIGN KEY ("businessId", "productServiceId") REFERENCES "ProductService"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_businessId_categoryId_fkey" FOREIGN KEY ("businessId", "categoryId") REFERENCES "ExpenseCategory"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerMetric" ADD CONSTRAINT "CustomerMetric_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductService" ADD CONSTRAINT "ProductService_values_check" CHECK (
  length(btrim("name")) > 0 AND "version" > 0 AND
  "sellingPrice" >= 0 AND "sellingPrice" < 1000000000000 AND
  ("costPrice" IS NULL OR ("costPrice" >= 0 AND "costPrice" < 1000000000000))
);
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_values_check" CHECK (
  length(btrim("name")) > 0 AND length("normalizedName") > 0 AND "version" > 0
);
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_values_check" CHECK (
  "version" > 0 AND "quantity" > 0 AND "quantity" < 1000000000 AND
  "unitPrice" >= 0 AND "unitPrice" < 1000000000000 AND
  ("unitCost" IS NULL OR ("unitCost" >= 0 AND "unitCost" < 1000000000000)) AND
  "totalAmount" >= 0 AND "totalAmount" < 1000000000000000 AND
  "saleDate" BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
);
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_values_check" CHECK (
  "version" > 0 AND "amount" > 0 AND "amount" < 1000000000000 AND
  "expenseDate" BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
);
ALTER TABLE "CustomerMetric" ADD CONSTRAINT "CustomerMetric_values_check" CHECK (
  "version" > 0 AND "customerCount" >= 0 AND
  "metricDate" BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
);
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_values_check" CHECK (
  "version" > 0 AND length(btrim("feedbackText")) > 0 AND
  ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)) AND
  "feedbackDate" BETWEEN DATE '1000-01-01' AND DATE '9999-12-31'
);

-- Defaults for existing profiles. New profiles receive these in their creation transaction.
INSERT INTO "ExpenseCategory" ("id", "businessId", "name", "normalizedName", "classification", "isDefault", "updatedAt")
SELECT 'default_' || md5(b."id" || ':' || c.name), b."id", c.name, lower(c.name),
  c.classification::"ExpenseClassification", true, CURRENT_TIMESTAMP
FROM "Business" b CROSS JOIN (VALUES
  ('Rent','OPERATING'), ('Salaries','OPERATING'), ('Marketing','OPERATING'),
  ('Utilities','OPERATING'), ('Supplies','OPERATING'), ('Transportation','OPERATING'),
  ('Maintenance','OPERATING'), ('Inventory','INVENTORY_PURCHASE'), ('Other','OTHER')
) AS c(name,classification);

-- Protect history even when ordinary SQL inserts bypass the application service.
CREATE FUNCTION lock_business_on_financial_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Business" SET "financialSettingsLockedAt" = CURRENT_TIMESTAMP,
    "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."businessId" AND "financialSettingsLockedAt" IS NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ProductService_lock_business" BEFORE INSERT OR UPDATE ON "ProductService"
FOR EACH ROW EXECUTE FUNCTION lock_business_on_financial_write();
CREATE TRIGGER "SalesRecord_lock_business" BEFORE INSERT OR UPDATE ON "SalesRecord"
FOR EACH ROW EXECUTE FUNCTION lock_business_on_financial_write();
CREATE TRIGGER "ExpenseRecord_lock_business" BEFORE INSERT OR UPDATE ON "ExpenseRecord"
FOR EACH ROW EXECUTE FUNCTION lock_business_on_financial_write();

COMMIT;
