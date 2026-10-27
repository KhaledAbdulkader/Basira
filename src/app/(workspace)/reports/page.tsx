import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import { listReports } from "@/lib/reports/service";
import { reportListSchema } from "@/lib/reports/contracts";
import { formatDate } from "@/lib/dashboard/format";
import { inputStyle } from "@/components/records/record-editor";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Reports" };
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser(),
    { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business)
    return (
      <section>
        <h1 className="text-3xl font-semibold">Reports</h1>
        <p className="my-4">Create a business to save its reports.</p>
        <Link href="/businesses/new" className="text-primary underline">
          Create your first business
        </Link>
      </section>
    );
  const query = reportListSchema.safeParse(await searchParams);
  if (!query.success)
    return (
      <section>
        <h1 className="text-2xl font-semibold">Check your report filters</h1>
        <Link href="/reports" className="text-primary underline">
          Reset filters
        </Link>
      </section>
    );
  const data = await listReports(
    getDatabase(),
    user.id,
    business.id,
    query.data,
  );
  const href = (page: number) =>
    `/reports?${new URLSearchParams({ page: String(page), type: data.type })}`;
  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-primary">{business.name}</p>
          <h1 className="mt-1 text-3xl font-semibold">Reports</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Saved business summaries you can review and export.
          </p>
        </div>
        <Link
          href="/reports/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Create report
        </Link>
      </header>
      <p className="text-sm leading-7 text-muted-foreground">
        Each report preserves its figures, name, currency and timezone at
        creation. Later edits do not change it. Create a new report to reflect
        corrected records.
      </p>
      <form action="/reports" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="report-filter" className="text-sm">
            Report type
          </label>
          <select
            id="report-filter"
            name="type"
            defaultValue={data.type}
            key={data.type}
            className={inputStyle}
          >
            <option value="ALL">All types</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
        <Button variant="outline" type="submit">
          Apply filters
        </Button>
      </form>
      <section aria-label="Report history" className="space-y-3">
        {!data.items.length && (
          <p className="rounded-xl border bg-card p-6">
            No reports match these filters. Create a report to save a business
            snapshot.
          </p>
        )}
        {data.items.map((r) => (
          <article key={r.id} className="rounded-xl border bg-card p-5">
            <Link
              href={`/reports/${r.id}`}
              className="font-semibold text-primary underline"
            >
              {r.reportType.charAt(0) + r.reportType.slice(1).toLowerCase()}{" "}
              report · {formatDate(r.from)} – {formatDate(r.to)}
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              {r.businessName} · {r.currency} · Saved{" "}
              {r.createdAt.replace("T", " ").slice(0, 19)} UTC
            </p>
          </article>
        ))}
      </section>
      <nav
        aria-label="Report pagination"
        className="flex flex-wrap items-center gap-4 text-sm"
      >
        <p>
          {data.total} reports · Page {data.page} of{" "}
          {Math.max(1, Math.ceil(data.total / 20))}
        </p>
        {data.page > 1 && (
          <Link href={href(data.page - 1)} className="text-primary underline">
            Previous
          </Link>
        )}
        {data.page * 20 < data.total && (
          <Link href={href(data.page + 1)} className="text-primary underline">
            Next
          </Link>
        )}
      </nav>
    </div>
  );
}
