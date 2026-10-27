import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure } from "@/lib/business/http";
import { getReport } from "@/lib/reports/service";
import { renderReportPdf } from "@/lib/reports/pdf";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; reportId: string }> },
) {
  try {
    const user = await requireUser(),
      { businessId, reportId } = await params;
    const report = await getReport(
      getDatabase(),
      user.id,
      businessId,
      reportId,
    );
    const buffer = await renderReportPdf(report);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="basira-${report.reportType.toLowerCase()}-${report.from}-${report.id}.pdf"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return businessFailure(error);
  }
}
