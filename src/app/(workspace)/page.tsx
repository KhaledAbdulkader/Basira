import Link from "next/link";
import { ZodError } from "zod";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import { getDashboard } from "@/lib/dashboard/service";
import { Dashboard } from "@/components/dashboard/dashboard";
import { WelcomeOverview } from "@/components/dashboard/welcome";
import { listForecasts } from "@/lib/forecasting/service";
import { LatestForecast } from "@/components/forecasting/latest-forecast";
import { getRecentAlerts } from "@/lib/alerts/service";
import { RecentAlerts } from "@/components/alerts/recent-alerts";

export const metadata = { title: "Overview" };
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business) return <WelcomeOverview />;
  const search = await searchParams;
  let data;
  let invalid: string | undefined;
  try {
    data = await getDashboard(getDatabase(), user.id, business.id, search);
  } catch (error) {
    if (error instanceof ZodError)
      invalid = error.issues[0]?.message ?? "Check your dates.";
    else throw error;
  }
  if (!data)
    return (
      <section className="rounded-2xl border bg-card p-8">
        <h1 className="text-2xl font-semibold">Check your dashboard period</h1>
        <p role="alert" className="my-4">
          {invalid}
        </p>
        <Link href="/" className="text-primary underline">
          Reset period
        </Link>
      </section>
    );
  const forecasts = await listForecasts(getDatabase(), user.id, business.id);
  const alerts = await getRecentAlerts(getDatabase(), user.id, business.id);
  return (
    <div className="space-y-6">
      <Dashboard data={data} />
      <LatestForecast
        run={forecasts.items[0]}
        businessId={business.id}
        timezone={business.timezone}
      />
      <RecentAlerts data={alerts} />
    </div>
  );
}
