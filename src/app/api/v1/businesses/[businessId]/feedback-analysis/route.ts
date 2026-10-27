import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { businessFailure, readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { AnalysisError } from "@/lib/feedback/contracts";
import { analyzeFeedback, getFeedbackInsights } from "@/lib/feedback/service";
import { getFeedbackAnalyzer } from "@/lib/feedback/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
type Context = { params: Promise<{ businessId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson(
      await getFeedbackInsights(getDatabase(), user.id, businessId),
    );
  } catch (error) {
    return businessFailure(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    const input = await readBusinessMutation(request);
    return privateJson(
      await analyzeFeedback(
        getDatabase(),
        user.id,
        businessId,
        input,
        getFeedbackAnalyzer,
      ),
    );
  } catch (error) {
    if (error instanceof AnalysisError)
      return privateJson({ message: error.message }, 503);
    return businessFailure(error);
  }
}
