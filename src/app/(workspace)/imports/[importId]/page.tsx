import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { getOwnedBusiness, BusinessError } from "@/lib/business/service";
import { getImport } from "@/lib/imports/service";
import { IMPORT_DEFINITIONS } from "@/lib/imports/constants";
import { ImportErrors } from "@/components/imports/import-errors";
import { businessIdSchema } from "@/lib/validation/business";
import { recordIdSchema } from "@/lib/validation/records";
export default async function ImportResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { importId } = await params;
  const query = await searchParams;
  const businessId = businessIdSchema.safeParse(query.business);
  if (!businessId.success || !recordIdSchema.safeParse(importId).success)
    notFound();
  let business, item;
  try {
    business = await getOwnedBusiness(getDatabase(), user.id, businessId.data);
    item = await getImport(getDatabase(), user.id, business.id, importId);
  } catch (error) {
    if (error instanceof BusinessError && error.status === 404) notFound();
    throw error;
  }
  return (
    <section className="mx-auto max-w-4xl rounded-2xl border bg-card p-5 sm:p-8">
      <Link className="text-sm text-primary underline" href="/imports">
        Back to imports
      </Link>
      <p className="mt-6 text-sm font-medium text-primary">{business.name}</p>
      <h1 className="mt-1 text-2xl font-semibold">Import result</h1>
      <p className="mt-3 break-words font-medium">{item.fileName}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {IMPORT_DEFINITIONS[item.importType].label} · {item.fileType} ·{" "}
        {new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: business.timezone,
        }).format(new Date(item.createdAt))}{" "}
        ({business.timezone})
      </p>
      <p className="my-5 rounded-xl bg-accent p-4 font-medium">
        {item.status === "PARTIAL" ? "Partial import" : "Completed"}:{" "}
        {item.importedRows} imported, {item.failedRows} skipped,{" "}
        {item.totalRows} total rows.
      </p>
      <p className="text-sm leading-6 text-muted-foreground">
        This result records the original import. Later edits or deletions do not
        change these counts. Basira does not retain the uploaded file. For a
        partial import, correct and upload only the skipped rows; uploading all
        rows again in a changed file can duplicate successful records.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Row validation results</h2>
      <ImportErrors errors={item.validationErrors} />
    </section>
  );
}
