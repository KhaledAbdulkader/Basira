import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { createConversation, listConversations } from "@/lib/assistant/service";
import { assistantFailure, readChatPage } from "@/lib/assistant/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ businessId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson(
      await listConversations(
        getDatabase(),
        user.id,
        businessId,
        readChatPage(request),
      ),
    );
  } catch (error) {
    return assistantFailure(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson(
      {
        conversation: await createConversation(
          getDatabase(),
          user.id,
          businessId,
          await readBusinessMutation(request),
        ),
      },
      201,
    );
  } catch (error) {
    return assistantFailure(error);
  }
}
