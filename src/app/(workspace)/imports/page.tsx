import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import { listImports } from "@/lib/imports/service";
import { importPageSchema } from "@/lib/imports/validation";
import { IMPORT_DEFINITIONS } from "@/lib/imports/constants";
import { ImportWorkspace } from "@/components/imports/import-workspace";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business)
    return (
      <section className="rounded-2xl border bg-card p-8">
        <h1 className="text-2xl font-semibold">Imports</h1>
        <p className="my-4 text-muted-foreground">
          Create a business to import its data.
        </p>
        <Link className="text-primary underline" href="/businesses/new">
          Create your first business
        </Link>
      </section>
    );
  const query = await searchParams;
  const page = importPageSchema.safeParse(query.page ?? 1);
  if (!page.success)
    return (
      <section>
        <h1 className="text-2xl font-semibold">
          Check the history page number
        </h1>
        <Link className="text-primary underline" href="/imports">
          Reset history
        </Link>
      </section>
    );
  const result = await listImports(
    getDatabase(),
    user.id,
    business.id,
    page.data,
  );
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">{business.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Imports</h1>
        <p className="mt-2 text-muted-foreground">
          Bring your existing records into Basira with a reviewed file import.
        </p>
      </header>
      <ImportWorkspace key={business.id} business={business} />
      <section
        className="rounded-2xl border bg-card p-5 sm:p-7"
        aria-labelledby="history-heading"
      >
        <h2 id="history-heading" className="text-lg font-semibold">
          Import history
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirmed imports only. Counts describe the original import, even if
          you later edit or delete individual records.
        </p>
        {!result.items.length ? (
          <p className="py-8 text-sm text-muted-foreground">
            {result.total
              ? "No imports on this page."
              : "No imports yet. Upload a file above to get started."}
          </p>
        ) : (
          <ul className="mt-5 divide-y">
            {result.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col justify-between gap-3 py-4 sm:flex-row"
              >
                <div className="min-w-0">
                  <Link
                    className="break-words font-medium text-primary underline"
                    href={`/imports/${item.id}?business=${business.id}`}
                  >
                    {item.fileName}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {IMPORT_DEFINITIONS[item.importType].label} ·{" "}
                    {item.fileType} ·{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: business.timezone,
                    }).format(new Date(item.createdAt))}
                  </p>
                </div>
                <p className="shrink-0 text-sm">
                  {item.status === "PARTIAL" ? "Partial" : "Completed"} ·{" "}
                  {item.importedRows} imported · {item.failedRows} skipped
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-4 text-sm">
          <p>
            {result.total} imports · Page {result.page} of{" "}
            {Math.max(1, Math.ceil(result.total / result.pageSize))}
          </p>
          <div className="flex gap-4">
            {result.page > 1 && (
              <Link
                className="text-primary underline"
                href={`/imports?page=${result.page - 1}`}
              >
                Previous imports
              </Link>
            )}
            {result.page * result.pageSize < result.total && (
              <Link
                className="text-primary underline"
                href={`/imports?page=${result.page + 1}`}
              >
                Next imports
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
