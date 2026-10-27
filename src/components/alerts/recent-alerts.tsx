import Link from "next/link";
import type { getRecentAlerts } from "@/lib/alerts/service";
import { formatDate } from "@/lib/dashboard/format";
export function RecentAlerts({
  data,
}: {
  data: Awaited<ReturnType<typeof getRecentAlerts>>;
}) {
  return (
    <section
      aria-label="Recent alerts"
      className="rounded-2xl border bg-card p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Recent alerts</h2>
        <Link href="/alerts" className="text-sm text-primary underline">
          View all alerts · {data.counts.unread} unread
        </Link>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Latest five non-dismissed alerts, across all dates. Rule checks use the
        latest {data.period.days} completed days; saved forecasts use their own
        dates. Independent of the dashboard filter.
      </p>
      {data.items.length ? (
        <ul className="mt-4 divide-y">
          {data.items.map((a) => (
            <li key={a.id} className="py-3">
              <p className="text-sm font-medium">
                {a.title} · {a.status.toLowerCase()}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {a.message}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {formatDate(a.periodFrom)} – {formatDate(a.periodTo)} ·
                Historical trigger
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          No non-dismissed alerts. Check alert settings and data coverage before
          interpreting this as good performance.
        </p>
      )}
    </section>
  );
}
