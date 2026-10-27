-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'CAFE', 'RETAIL', 'E_COMMERCE', 'SERVICE_PROVIDER', 'STARTUP', 'PROFESSIONAL_SERVICES', 'OTHER');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "businessType" "BusinessType" NOT NULL,
    "otherBusinessType" VARCHAR(120),
    "location" VARCHAR(180),
    "currency" CHAR(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "financialSettingsLockedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Business_ownerId_createdAt_id_idx" ON "Business"("ownerId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Business" ADD CONSTRAINT "Business_name_valid" CHECK (length(btrim("name")) > 0);
ALTER TABLE "Business" ADD CONSTRAINT "Business_version_positive" CHECK ("version" > 0);
ALTER TABLE "Business" ADD CONSTRAINT "Business_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "Business" ADD CONSTRAINT "Business_other_type" CHECK (
  ("businessType" = 'OTHER' AND "otherBusinessType" IS NOT NULL AND length(btrim("otherBusinessType")) > 0)
  OR ("businessType" <> 'OTHER' AND "otherBusinessType" IS NULL)
);

-- Once financial history starts, preserve its units/calendar even if rows are
-- later removed. Future financial writers set the marker under a row lock in
-- the same transaction as their first record. The public API cannot set it.
CREATE FUNCTION protect_business_financial_settings() RETURNS trigger AS $$
BEGIN
  IF OLD."financialSettingsLockedAt" IS NOT NULL AND (
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."timezone" IS DISTINCT FROM OLD."timezone" OR
    NEW."financialSettingsLockedAt" IS DISTINCT FROM OLD."financialSettingsLockedAt"
  ) THEN
    RAISE EXCEPTION 'Business financial settings are locked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Business_protect_financial_settings" BEFORE UPDATE ON "Business"
FOR EACH ROW EXECUTE FUNCTION protect_business_financial_settings();
