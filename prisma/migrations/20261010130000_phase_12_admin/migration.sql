BEGIN;
ALTER TABLE "User" ADD COLUMN "statusVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD CONSTRAINT "User_statusVersion_check" CHECK ("statusVersion" > 0);
CREATE FUNCTION advance_user_status_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."statusVersion" := OLD."statusVersion" + CASE WHEN NEW."status" IS DISTINCT FROM OLD."status" THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_status_version" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION advance_user_status_version();
CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "Business_createdAt_id_idx" ON "Business"("createdAt", "id");
COMMIT;
