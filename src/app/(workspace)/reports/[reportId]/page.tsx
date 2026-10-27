import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import { BusinessError } from "@/lib/business/service";
import { getReport } from "@/lib/reports/service";
import { reportIdSchema } from "@/lib/reports/contracts";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportDocument } from "@/components/reports/report-document";
import { formatDate } from "@/lib/dashboard/format";
export const metadata = { title: "Saved report" };
export default async function ReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await requirePageUser(),
    { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business) redirect("/reports");
  const id = reportIdSchema.safeParse((await params).reportId);
  if (!id.success) notFound();
  const report = await getReport(
    getDatabase(),
    user.id,
    business.id,
    id.data,
  ).catch((error) => {
    if (error instanceof BusinessError && error.status === 404) notFound();
    throw error;
  });
  const { snapshot: _snapshot, ...actionData } = report;
  void _snapshot;
  return (
    <div className="min-w-0 space-y-6">
      <Link href="/reports" className="text-sm text-primary underline">
        Report history
      </Link>
      <header>
        <p className="text-sm text-primary">{report.businessName}</p>
        <h1 className="mt-1 text-3xl font-semibold">
          {report.reportType.charAt(0) +
            report.reportType.slice(1).toLowerCase()}{" "}
          report
        </h1>
        <p className="mt-3 text-sm">
          {formatDate(report.from)} – {formatDate(report.to)} ·{" "}
          {report.currency} · {report.timezone}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Saved {report.createdAt.replace("T", " ").slice(0, 19)} UTC. Figures
          are preserved as recorded at generation time.
        </p>
      </header>
      <ReportActions businessId={business.id} report={actionData} />
      <ReportDocument report={report} />
    </div>
  );
}
