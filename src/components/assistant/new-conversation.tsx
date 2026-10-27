"use client";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputStyle } from "@/components/records/record-editor";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function NewConversation({
  businessId,
  today,
}: {
  businessId: string;
  today: string;
}) {
  const router = useRouter();
  // A select change before hydration cannot update the controlled date fields.
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [period, setPeriod] = useState("30d");
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const query =
        period === "month"
          ? { period: "custom", from: today.slice(0, 8) + "01", to: today }
          : period === "custom"
            ? { period, from, to }
            : { period };
      const response = await fetch(
        `/api/v1/businesses/${businessId}/conversations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(query),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "Unable to start a conversation.");
      router.push(`/assistant/${body.conversation.id}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check your connection and try again.",
      );
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={create}
      className="rounded-2xl border bg-card p-5 sm:p-7"
      aria-label="New conversation"
    >
      <h2 className="text-xl font-semibold">Start a conversation</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Choose the dates you want to discuss. Each question uses a fresh summary
        for those fixed dates, with the preceding period for comparison.
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="min-w-44 text-sm font-medium">
          Reporting period
          <select
            className={inputStyle}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={busy || !ready}
          >
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="7d">Last 7 days</option>
            <option value="90d">Last 90 days</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <label className="text-sm font-medium">
              From
              <input
                className={inputStyle}
                type="date"
                min="1000-01-01"
                max={today}
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="text-sm font-medium">
              To
              <input
                className={inputStyle}
                type="date"
                min={from}
                max={today}
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={busy}
              />
            </label>
          </>
        )}
        <Button type="submit" disabled={busy || !ready}>
          {busy ? "Creating…" : "Start conversation"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
