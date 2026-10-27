import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { sendMessage } from "@/lib/assistant/service";
import { getBusinessAssistant } from "@/lib/assistant/server";
import { assistantFailure } from "@/lib/assistant/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
type Context = {
  params: Promise<{ businessId: string; conversationId: string }>;
};
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, conversationId } = await params;
    return privateJson(
      await sendMessage(
        getDatabase(),
        user.id,
        businessId,
        conversationId,
        await readBusinessMutation(request),
        getBusinessAssistant,
      ),
    );
  } catch (error) {
    return assistantFailure(error);
  }
}
