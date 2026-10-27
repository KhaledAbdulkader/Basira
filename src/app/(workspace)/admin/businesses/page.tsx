import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/server";
import { adminBusinesses } from "@/lib/admin/service";
import { adminBusinessesQuery } from "@/lib/admin/contracts";
import { getDatabase } from "@/lib/db/client";
import { BUSINESS_TYPES, businessTypeLabel } from "@/lib/business/constants";
import { AdminPagination } from "@/components/admin/pagination";
import { inputStyle } from "@/components/records/record-editor";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Business directory" };
export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminPage(),
    parsed = adminBusinessesQuery.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <section>
        <h2 className="text-xl font-semibold">Check your business filters</h2>
        <Link href="/admin/businesses" className="text-primary underline">
          Reset filters
        </Link>
      </section>
    );
  const data = await adminBusinesses(getDatabase(), actor.id, parsed.data);
  return (
    <section aria-labelledby="admin-businesses-title" className="space-y-5">
      <h2 id="admin-businesses-title" className="text-xl font-semibold">
        Business directory
      </h2>
      <p className="text-sm text-muted-foreground">
        Basic registration metadata only. Select your own businesses from the
        workspace switcher to access their records.
      </p>
      <form
        action="/admin/businesses"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="admin-business-search" className="text-sm">
            Search businesses
          </label>
          <input
            id="admin-business-search"
            name="q"
            type="search"
            maxLength={120}
            key={data.q}
            defaultValue={data.q}
            placeholder="Business name or owner name/email"
            className={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="admin-business-type" className="text-sm">
            Business type
          </label>
          <select
            id="admin-business-type"
            name="type"
            defaultValue={data.type}
            key={data.type}
            className={inputStyle}
          >
            <option value="ALL">All types</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        <Link
          href="/admin/businesses"
          className="py-2 text-sm text-primary underline"
        >
          Reset filters
        </Link>
      </form>
      <div
        role="region"
        aria-label="Business results"
        className="grid gap-3 md:grid-cols-2"
      >
        {!data.items.length && (
          <p className="rounded-xl border bg-card p-6">
            No businesses match these filters.
          </p>
        )}
        {data.items.map((business) => (
          <article
            key={business.id}
            className="min-w-0 space-y-2 rounded-xl border bg-card p-5"
          >
            <h3 className="break-words font-semibold">{business.name}</h3>
            <p className="text-sm">
              {businessTypeLabel(business.businessType, null)}
            </p>
            <p className="break-words text-sm">
              Owner: {business.owner.name ?? "Unnamed account"}
            </p>
            <p className="break-all text-sm text-muted-foreground">
              {business.owner.email}
            </p>
            <p className="text-xs text-muted-foreground">
              Owner {business.owner.status.toLowerCase()} · Created{" "}
              {business.createdAt.slice(0, 10)} (UTC)
            </p>
          </article>
        ))}
      </div>
      <AdminPagination
        base="/admin/businesses"
        page={data.page}
        total={data.total}
        filters={{ q: data.q, type: data.type }}
      />
    </section>
  );
}
