import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import { listConversations } from "@/lib/assistant/service";
import { chatPageSchema } from "@/lib/assistant/contracts";
import { businessToday } from "@/lib/records/dates";
import { formatDate } from "@/lib/dashboard/format";
import { NewConversation } from "@/components/assistant/new-conversation";
export const metadata = { title: "AI Assistant" };
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business)
    return (
      <section className="rounded-2xl border bg-card p-8">
        <h1 className="text-3xl font-semibold">AI Assistant</h1>
        <p className="my-4">Create a business to start a conversation.</p>
        <Link className="text-primary underline" href="/businesses/new">
          Create your first business
        </Link>
      </section>
    );
  const query = await searchParams,
    page = chatPageSchema.safeParse(query.page ?? 1);
  if (!page.success)
    return (
      <section>
        <h1 className="text-2xl font-semibold">
          Check the conversation page number
        </h1>
        <Link className="text-primary underline" href="/assistant">
          Reset history
        </Link>
      </section>
    );
  const history = await listConversations(
    getDatabase(),
    user.id,
    business.id,
    page.data,
  );
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">{business.name}</p>
        <h1 className="mt-1 text-3xl font-semibold">AI Assistant</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Understand your business records, explore possible next steps, and ask
          for clear explanations of business terms.
        </p>
      </header>
      <NewConversation
        key={business.id}
        businessId={business.id}
        today={businessToday(business.timezone)}
      />
      <section
        className="rounded-2xl border bg-card p-5 sm:p-7"
        aria-label="Saved conversations"
      >
        <h2 className="text-xl font-semibold">Saved conversations</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Conversations belong to this business. Only its owner can read them.
        </p>
        {history.items.length ? (
          <ul className="mt-5 divide-y">
            {history.items.map((c) => (
              <li key={c.id} className="py-4">
                <Link
                  href={`/assistant/${c.id}`}
                  className="font-medium text-primary underline [overflow-wrap:anywhere]"
                >
                  {c.title}
                </Link>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(c.periodFrom)} – {formatDate(c.periodTo)} ·{" "}
                  {c.messageCount / 2} questions
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-sm">
            No conversations on this page. Start one above.
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-4 text-sm">
          <p>
            {history.total} conversations · Page {history.page} of{" "}
            {Math.max(1, Math.ceil(history.total / history.pageSize))}
          </p>
          <div className="flex gap-4">
            {history.page > 1 && (
              <Link
                className="text-primary underline"
                href={`/assistant?page=${history.page - 1}`}
              >
                Previous conversations
              </Link>
            )}
            {history.page * history.pageSize < history.total && (
              <Link
                className="text-primary underline"
                href={`/assistant?page=${history.page + 1}`}
              >
                Next conversations
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
