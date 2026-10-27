import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { deleteConversation, getConversation } from "@/lib/assistant/service";
import { assistantFailure, readChatPage } from "@/lib/assistant/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = {
  params: Promise<{ businessId: string; conversationId: string }>;
};
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, conversationId } = await params;
    return privateJson(
      await getConversation(
        getDatabase(),
        user.id,
        businessId,
        conversationId,
        readChatPage(request),
      ),
    );
  } catch (error) {
    return assistantFailure(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, conversationId } = await params;
    await deleteConversation(
      getDatabase(),
      user.id,
      businessId,
      conversationId,
      await readBusinessMutation(request),
    );
    return privateJson({ deleted: true });
  } catch (error) {
    return assistantFailure(error);
  }
}
