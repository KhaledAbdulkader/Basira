import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { getReport } from "@/lib/reports/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; reportId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId, reportId } = await params;
    return privateJson({
      report: await getReport(getDatabase(), user.id, businessId, reportId),
    });
  } catch (error) {
    return businessFailure(error);
  }
}
