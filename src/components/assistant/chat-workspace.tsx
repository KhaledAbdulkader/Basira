"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NVIDIA_ASSISTANT_MODEL_LABEL } from "@/lib/ai/models";
import {
  chatErrorMessage,
  METRIC_LABELS,
  MAX_MESSAGES,
  type ConversationDetail,
} from "@/lib/assistant/contracts";
import type { AssistantContext } from "@/lib/assistant/context";
import { formatDate, formatMoney } from "@/lib/dashboard/format";

export function ChatWorkspace({
  businessId,
  detail,
}: {
  businessId: string;
  detail: ConversationDetail;
}) {
  const router = useRouter();
  const { conversation, messages } = detail;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const requestId = useRef<string | null>(null);
  const endpoint = `/api/v1/businesses/${businessId}/conversations/${conversation.id}`;
  async function invoke(kind: "messages" | "retry", body: object) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, version: conversation.version }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Unable to complete this request.");
      if (kind === "messages") {
        setDraft("");
        requestId.current = null;
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connection interrupted. Refresh before retrying; your question may already be saved.",
      );
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    requestId.current ??= crypto.randomUUID();
    await invoke("messages", { message: draft, requestId: requestId.current });
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: conversation.version,
          confirmed: confirmDelete,
        }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message ??
            "Unable to delete this conversation.",
        );
      router.push("/assistant");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to delete. Try again.",
      );
      setBusy(false);
    }
  }
  const prompts = [
    "What do the records show about my estimated profit?",
    "Are expenses increasing?",
    "What are customers complaining about?",
    "How could a business like mine improve customer retention?",
  ];
  return (
    <div className="min-w-0 space-y-6">
      <div className="rounded-2xl border bg-card p-5 text-sm leading-6">
        <p>
          <strong>Reporting dates:</strong>{" "}
          {formatDate(conversation.periodFrom)} –{" "}
          {formatDate(conversation.periodTo)}. Start a new conversation for
          different dates.
        </p>
        <p className="mt-2 text-muted-foreground">
          Sending a question shares it, up to three recent exchanges, and this
          business’s aggregate metrics, product/category names, feedback topic
          counts, saved forecast summaries and recent historical alerts with
          NVIDIA’s hosted {NVIDIA_ASSISTANT_MODEL_LABEL} model. Do not include
          personal or sensitive information.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Decision support, not professional accounting, legal, auditing,
          investment or financial advice. AI can make mistakes; verify its
          observations against the saved data. Replies use plain English.
        </p>
      </div>
      <section
        className="min-w-0 rounded-2xl border bg-card p-4 sm:p-6"
        aria-label="Conversation messages"
      >
        {!messages.length && (
          <div className="py-5">
            <h2 className="text-lg font-semibold">
              What would you like to understand?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask about the selected business or general ways to run a small
              business.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  className="rounded-xl border p-4 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setDraft(prompt);
                    requestId.current = null;
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        <ol className="space-y-5">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`min-w-0 rounded-xl border p-4 sm:p-5 ${message.role === "USER" ? "bg-accent/50 sm:ml-12" : "bg-background sm:mr-8"}`}
            >
              <h2 className="text-xs font-semibold text-primary">
                {message.role === "USER" ? "You" : "Basira assistant"}
              </h2>
              {message.content && (
                <p className="mt-3 text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {message.content}
                </p>
              )}
              {message.status === "PENDING" && (
                <p className="mt-3 text-sm">
                  {message.retryable
                    ? "This answer was interrupted. You can retry it."
                    : "Preparing an answer. Refresh shortly; an interrupted request becomes available after 150 seconds."}
                </p>
              )}
              {message.status === "FAILED" && (
                <p className="mt-3 text-sm text-red-700 dark:text-red-300">
                  {chatErrorMessage(message.errorCode)}
                </p>
              )}
              {message.retryable && (
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  disabled={busy || detail.hasActiveRequest}
                  onClick={() => invoke("retry", { messageId: message.id })}
                >
                  Retry answer
                </Button>
              )}
              {!!message.referencedMetrics.length && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Data references:{" "}
                  {message.referencedMetrics
                    .map((key) => METRIC_LABELS[key])
                    .join(" · ")}
                </p>
              )}
              {!!message.warnings.length && (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-xs leading-5 text-muted-foreground">
                  {message.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              )}
              {message.context && <ContextSnapshot context={message.context} />}
              {message.role === "ASSISTANT" &&
                message.status === "COMPLETED" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    AI-generated · {message.model}
                  </p>
                )}
            </li>
          ))}
        </ol>
        {conversation.messageCount > detail.pageSize && (
          <nav
            aria-label="Message history pages"
            className="mt-5 flex flex-wrap justify-between gap-4 border-t pt-4 text-sm"
          >
            <span>
              History page {detail.page} of{" "}
              {Math.ceil(conversation.messageCount / detail.pageSize)}
            </span>
            {detail.page * detail.pageSize < conversation.messageCount && (
              <Link
                className="text-primary underline"
                href={`/assistant/${conversation.id}?page=${detail.page + 1}`}
              >
                Older messages
              </Link>
            )}
            {detail.page > 1 && (
              <Link
                className="text-primary underline"
                href={`/assistant/${conversation.id}?page=${detail.page - 1}`}
              >
                Newer messages
              </Link>
            )}
          </nav>
        )}
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-card p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Working… An AI answer can take up to 60 seconds.
        </p>
      )}
      {detail.page === 1 ? (
        <form
          onSubmit={send}
          className="space-y-3 rounded-2xl border bg-card p-5"
        >
          <label htmlFor="business-question" className="text-sm font-semibold">
            Your business question
          </label>
          <textarea
            id="business-question"
            className="block min-h-28 w-full rounded-xl border bg-background p-3 text-sm leading-6"
            maxLength={2000}
            required
            disabled={
              busy ||
              detail.hasActiveRequest ||
              conversation.messageCount >= MAX_MESSAGES
            }
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              requestId.current = null;
            }}
            placeholder="Ask about the records for these dates, or ask for general business advice…"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {draft.length}/2000 · One request per business per minute.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => router.refresh()}
              >
                Refresh conversation
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  detail.hasActiveRequest ||
                  !draft.trim() ||
                  conversation.messageCount >= MAX_MESSAGES
                }
              >
                Send question
              </Button>
            </div>
          </div>
          {conversation.messageCount >= MAX_MESSAGES && (
            <p className="text-sm">
              This conversation has reached 50 questions.{" "}
              <Link href="/assistant" className="text-primary underline">
                Start a new conversation
              </Link>
              .
            </p>
          )}
          {detail.hasActiveRequest && (
            <p role="status" className="text-sm">
              An answer is being prepared for this business. Refresh shortly.
            </p>
          )}
        </form>
      ) : (
        <Link
          className="text-sm text-primary underline"
          href={`/assistant/${conversation.id}`}
        >
          Return to latest messages to ask a question
        </Link>
      )}
      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Delete conversation
        </summary>
        <p className="mt-3">
          This permanently removes this conversation, its messages and saved
          data snapshots.
        </p>
        <label className="my-4 flex items-center gap-3">
          <input
            type="checkbox"
            checked={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.checked)}
            disabled={busy}
          />
          I confirm permanent deletion.
        </label>
        <Button
          variant="outline"
          disabled={busy || !confirmDelete}
          onClick={remove}
        >
          Permanently delete conversation
        </Button>
      </details>
    </div>
  );
}

function ContextSnapshot({ context }: { context: AssistantContext }) {
  const rows = [
    "revenue",
    "totalExpenses",
    "operating",
    "inventory",
    "other",
    "cogs",
    "profit",
    "margin",
    "averageSale",
    "costCoverage",
    "visits",
  ] as const;
  const value = (
    key: (typeof rows)[number],
    period: AssistantContext["current"],
  ) => {
    const v = period[key];
    if (v === null || (key === "visits" && !period.customerDays))
      return "Not available";
    return key === "visits"
      ? String(v)
      : key === "margin" || key === "costCoverage"
        ? `${v}%`
        : formatMoney(String(v), context.business.currency);
  };
  return (
    <details className="mt-4 rounded-lg border p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        View saved business data
      </summary>
      <p className="mt-3 leading-5">
        Captured {context.capturedAt.replace("T", " ").slice(0, 19)} UTC ·{" "}
        {context.business.currency} · {context.business.timezone}. This is the
        summary shared for this attempt; later record edits do not rewrite it.
      </p>
      <div
        className="mt-3 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Saved metric comparison"
      >
        <table className="w-full text-left">
          <caption className="sr-only">
            Server-calculated business metrics
          </caption>
          <thead>
            <tr>
              <th className="p-2">Metric</th>
              <th className="p-2">
                {context.period.from} – {context.period.to}
              </th>
              <th className="p-2">
                {context.comparisonPeriod.from} – {context.comparisonPeriod.to}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((key) => (
              <tr key={key} className="border-t">
                <th className="p-2 font-medium">{METRIC_LABELS[key]}</th>
                <td className="p-2 whitespace-nowrap">
                  {value(key, context.current)}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {value(key, context.previous)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3">
        Sales growth:{" "}
        {context.comparison.revenueGrowth === null
          ? "Not available"
          : `${context.comparison.revenueGrowth}%`}
        . Customer dates recorded: {context.current.customerDays}/
        {context.period.days}.
      </p>
      <p className="mt-2">
        Feedback: {context.sentiment.positive} positive,{" "}
        {context.sentiment.neutral} neutral, {context.sentiment.negative}{" "}
        negative, {context.sentiment.unknown} not analyzed.
      </p>
      <p className="mt-3 font-semibold">Top products by revenue</p>
      <ul className="mt-1 space-y-1">
        {context.topProductsByRevenue.map((p, i) => (
          <li key={i} className="[overflow-wrap:anywhere]">
            {p.name}: {formatMoney(p.revenue, context.business.currency)} ·{" "}
            {p.quantity} units
          </li>
        ))}
        {!context.topProductsByRevenue.length && <li>No sales recorded.</li>}
      </ul>
      <p className="mt-3 font-semibold">Expense breakdown</p>
      <ul className="mt-1 space-y-1">
        {context.expenseBreakdown.map((c, i) => (
          <li key={i}>
            {c.name} ({c.classification.toLowerCase().replaceAll("_", " ")}):{" "}
            {formatMoney(c.amount, context.business.currency)}
          </li>
        ))}
        {!context.expenseBreakdown.length && <li>No expenses recorded.</li>}
      </ul>
      <p className="mt-3 font-semibold">Feedback topics</p>
      <ul className="mt-1 space-y-1">
        {context.feedbackTopics.map((t) => (
          <li key={t.topic}>
            {t.topic}: {t.positive} positive, {t.neutral} neutral, {t.negative}{" "}
            negative
          </li>
        ))}
        {!context.feedbackTopics.length && <li>No analyzed topics.</li>}
      </ul>
      <p className="mt-3 font-semibold">Recent saved forecasts</p>
      <ul className="mt-1 space-y-1">
        {context.forecasts.map((f, i) => (
          <li key={i}>
            {f.metric === "REVENUE" ? "Revenue" : "All expenses"}:{" "}
            {formatMoney(f.total, f.currency)} · {f.from} – {f.to} · History
            through {f.trainingEnd}
          </li>
        ))}
        {!context.forecasts.length && <li>No saved forecasts.</li>}
      </ul>
      {context.recentAlerts && (
        <>
          <p className="mt-3 font-semibold">Recent historical alerts</p>
          <ul className="mt-1 space-y-2">
            {context.recentAlerts.map((a, i) => (
              <li key={i}>
                {a.title}: {a.message} · {a.from} – {a.to}
              </li>
            ))}
            {!context.recentAlerts.length && (
              <li>No non-dismissed alerts provided.</li>
            )}
          </ul>
          <p className="mt-2">
            Alerts preserve past triggers across all dates; they do not prove a
            condition is still present.
          </p>
        </>
      )}
    </details>
  );
}
