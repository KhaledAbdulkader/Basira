BEGIN;
-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('PRODUCTS', 'SALES', 'EXPENSES', 'CUSTOMER_METRICS', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "ImportFileType" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('COMPLETED', 'PARTIAL');

-- AlterTable
ALTER TABLE "CustomerFeedback" ADD COLUMN     "dataImportId" TEXT;

-- AlterTable
ALTER TABLE "CustomerMetric" ADD COLUMN     "dataImportId" TEXT;

-- AlterTable
ALTER TABLE "ExpenseRecord" ADD COLUMN     "dataImportId" TEXT;

-- AlterTable
ALTER TABLE "ProductService" ADD COLUMN     "dataImportId" TEXT,
ADD COLUMN     "source" "RecordSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "SalesRecord" ADD COLUMN     "dataImportId" TEXT;

-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fileName" VARCHAR(180) NOT NULL,
    "fileType" "ImportFileType" NOT NULL,
    "fileHash" CHAR(64) NOT NULL,
    "importType" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "failedRows" INTEGER NOT NULL,
    "validationErrors" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataImport_businessId_createdAt_id_idx" ON "DataImport"("businessId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DataImport_businessId_id_key" ON "DataImport"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DataImport_businessId_importType_fileHash_key" ON "DataImport"("businessId", "importType", "fileHash");

-- CreateIndex
CREATE INDEX "CustomerFeedback_businessId_dataImportId_idx" ON "CustomerFeedback"("businessId", "dataImportId");

-- CreateIndex
CREATE INDEX "CustomerMetric_businessId_dataImportId_idx" ON "CustomerMetric"("businessId", "dataImportId");

-- CreateIndex
CREATE INDEX "ExpenseRecord_businessId_dataImportId_idx" ON "ExpenseRecord"("businessId", "dataImportId");

-- CreateIndex
CREATE INDEX "ProductService_businessId_dataImportId_idx" ON "ProductService"("businessId", "dataImportId");

-- CreateIndex
CREATE INDEX "SalesRecord_businessId_dataImportId_idx" ON "SalesRecord"("businessId", "dataImportId");

-- AddForeignKey
ALTER TABLE "ProductService" ADD CONSTRAINT "ProductService_businessId_dataImportId_fkey" FOREIGN KEY ("businessId", "dataImportId") REFERENCES "DataImport"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_businessId_dataImportId_fkey" FOREIGN KEY ("businessId", "dataImportId") REFERENCES "DataImport"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_businessId_dataImportId_fkey" FOREIGN KEY ("businessId", "dataImportId") REFERENCES "DataImport"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerMetric" ADD CONSTRAINT "CustomerMetric_businessId_dataImportId_fkey" FOREIGN KEY ("businessId", "dataImportId") REFERENCES "DataImport"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_businessId_dataImportId_fkey" FOREIGN KEY ("businessId", "dataImportId") REFERENCES "DataImport"("businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_counts_check" CHECK (
  "totalRows" BETWEEN 1 AND 1000 AND "importedRows" > 0 AND "failedRows" >= 0
  AND "importedRows" + "failedRows" = "totalRows"
  AND (("status" = 'COMPLETED' AND "failedRows" = 0) OR ("status" = 'PARTIAL' AND "failedRows" > 0))
);
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_hash_check" CHECK ("fileHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "ProductService" ADD CONSTRAINT "ProductService_import_source_check" CHECK (("source" = 'IMPORT') = ("dataImportId" IS NOT NULL));
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_import_source_check" CHECK (("source" = 'IMPORT') = ("dataImportId" IS NOT NULL));
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_import_source_check" CHECK (("source" = 'IMPORT') = ("dataImportId" IS NOT NULL));
ALTER TABLE "CustomerMetric" ADD CONSTRAINT "CustomerMetric_import_source_check" CHECK (("source" = 'IMPORT') = ("dataImportId" IS NOT NULL));
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_import_source_check" CHECK (("source" = 'IMPORT') = ("dataImportId" IS NOT NULL));
COMMIT;
