import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { BusinessError } from "@/lib/business/service";
import { getDatabase } from "@/lib/db/client";
import { getConversation } from "@/lib/assistant/service";
import { chatPageSchema } from "@/lib/assistant/contracts";
import { recordIdSchema } from "@/lib/validation/records";
import { ChatWorkspace } from "@/components/assistant/chat-workspace";
export const metadata = { title: "Business conversation" };
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser(),
    { selectedBusiness: business } = await getWorkspaceBusinesses();
  const { conversationId } = await params;
  if (!business || !recordIdSchema.safeParse(conversationId).success)
    notFound();
  const query = await searchParams,
    parsed = chatPageSchema.safeParse(query.page ?? 1);
  if (!parsed.success)
    return (
      <section>
        <h1 className="text-2xl font-semibold">
          Check the message page number
        </h1>
        <Link
          className="text-primary underline"
          href={`/assistant/${conversationId}`}
        >
          Latest messages
        </Link>
      </section>
    );
  let detail;
  try {
    detail = await getConversation(
      getDatabase(),
      user.id,
      business.id,
      conversationId,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof BusinessError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <Link className="text-sm text-primary underline" href="/assistant">
          All conversations / New conversation
        </Link>
        <p className="mt-4 text-xs text-muted-foreground">{business.name}</p>
        <h1 className="mt-1 text-2xl font-semibold [overflow-wrap:anywhere]">
          {detail.conversation.title}
        </h1>
      </header>
      <ChatWorkspace
        key={conversationId}
        businessId={business.id}
        detail={detail}
      />
    </div>
  );
}
