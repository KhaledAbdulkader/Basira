import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { businessToday } from "@/lib/records/dates";
import { NewReport } from "@/components/reports/new-report";
export const metadata = { title: "Create report" };
export default async function NewReportPage() {
  await requirePageUser();
  const { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business) redirect("/businesses/new");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/reports" className="text-sm text-primary underline">
        Report history
      </Link>
      <header>
        <p className="text-sm text-primary">{business.name}</p>
        <h1 className="mt-1 text-3xl font-semibold">Create report</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Save a dated summary in {business.timezone}.
        </p>
      </header>
      <NewReport
        key={business.id}
        businessId={business.id}
        today={businessToday(business.timezone, new Date())}
      />
    </div>
  );
}
