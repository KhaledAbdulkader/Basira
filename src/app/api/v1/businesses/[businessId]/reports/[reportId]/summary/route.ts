import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure, readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { summarizeReport } from "@/lib/reports/service";
import { getReportSummarizer } from "@/lib/reports/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string; reportId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId, reportId } = await params;
    return privateJson({
      report: await summarizeReport(
        getDatabase(),
        user.id,
        businessId,
        reportId,
        await readBusinessMutation(request),
        getReportSummarizer,
      ),
    });
  } catch (error) {
    return businessFailure(error);
  }
}
