import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { readBusinessMutation, businessFailure } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { createReport, listReports } from "@/lib/reports/service";
import { readReportQuery } from "@/lib/reports/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ businessId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    return privateJson(
      await listReports(
        getDatabase(),
        user.id,
        (await params).businessId,
        readReportQuery(request),
      ),
    );
  } catch (error) {
    return businessFailure(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const result = await createReport(
      getDatabase(),
      user.id,
      (await params).businessId,
      await readBusinessMutation(request),
    );
    return privateJson(result, result.alreadyGenerated ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}
