import { requireAdminPage } from "@/lib/admin/server";
import { adminStatistics } from "@/lib/admin/service";
import { getDatabase } from "@/lib/db/client";
export const metadata = { title: "Administration" };
export default async function AdminPage() {
  const user = await requireAdminPage(),
    stats = await adminStatistics(getDatabase(), user.id);
  return (
    <section aria-labelledby="admin-statistics-title" className="space-y-5">
      <h2 id="admin-statistics-title" className="text-xl font-semibold">
        System statistics
      </h2>
      <p className="text-sm text-muted-foreground">
        Current platform totals, including administrator accounts and businesses
        owned by suspended users.
      </p>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total users", stats.totalUsers],
          ["Active users", stats.activeUsers],
          ["Suspended users", stats.suspendedUsers],
          ["Total businesses", stats.totalBusinesses],
        ].map(([label, count]) => (
          <div key={label} className="rounded-2xl border bg-card p-6">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-3 text-3xl font-semibold tabular-nums">
              {count}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
