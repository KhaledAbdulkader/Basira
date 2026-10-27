import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import { getAlerts } from "@/lib/alerts/service";
import { alertListSchema } from "@/lib/alerts/contracts";
import { AlertWorkspace } from "@/components/alerts/alert-workspace";
export const metadata = { title: "Alerts" };
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser(),
    { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business)
    return (
      <section className="rounded-2xl border bg-card p-8">
        <h1 className="text-3xl font-semibold">Alerts</h1>
        <p className="my-4">Create a business to monitor its records.</p>
        <Link href="/businesses/new" className="text-primary underline">
          Create your first business
        </Link>
      </section>
    );
  const query = alertListSchema.safeParse(await searchParams);
  if (!query.success)
    return (
      <section>
        <h1 className="text-2xl font-semibold">Check your alert filters</h1>
        <Link href="/alerts" className="text-primary underline">
          Reset filters
        </Link>
      </section>
    );
  const data = await getAlerts(getDatabase(), user.id, business.id, query.data);
  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-primary">{business.name}</p>
          <h1 className="mt-1 text-3xl font-semibold">Alerts</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Changes worth reviewing, based on your recorded business data.
          </p>
        </div>
        <Link
          href={`/businesses/${business.id}/alert-rules`}
          className="text-sm text-primary underline"
        >
          Edit alert settings
        </Link>
      </header>
      <AlertWorkspace key={business.id} businessId={business.id} data={data} />
    </div>
  );
}
