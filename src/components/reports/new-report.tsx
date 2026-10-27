"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputStyle } from "@/components/records/record-editor";
export function NewReport({
  businessId,
  today,
}: {
  businessId: string;
  today: string;
}) {
  const router = useRouter();
  const [type, setType] = useState("WEEKLY"),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<{ signature: string; id: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = {
        reportType: type,
        ...(type === "CUSTOM" ? { from, to } : {}),
      },
      signature = JSON.stringify(fields);
    if (!request.current || request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/v1/businesses/${businessId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, requestId: request.current.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Unable to create the report.");
      router.push(`/reports/${data.report.id}`);
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
      onSubmit={submit}
      className="space-y-6 rounded-2xl border bg-card p-6 sm:p-8"
    >
      <div>
        <label htmlFor="report-type" className="text-sm font-medium">
          Report period
        </label>
        <select
          id="report-type"
          className={inputStyle}
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={busy}
        >
          <option value="WEEKLY">Weekly — last completed Monday–Sunday</option>
          <option value="MONTHLY">Monthly — previous calendar month</option>
          <option value="CUSTOM">Custom dates</option>
        </select>
      </div>
      {type === "CUSTOM" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm">
            Start date
            <input
              className={inputStyle}
              type="date"
              min="1000-01-01"
              max={to}
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="min-w-0 text-sm">
            End date
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
        </div>
      )}
      <p className="text-sm leading-7 text-muted-foreground">
        Dates use your business timezone. Custom reports support up to 366 days
        and can include today, with an incomplete-day note. Creating a report
        saves its figures and permanently locks currency and timezone.
      </p>
      <p className="text-sm leading-7 text-muted-foreground">
        Every report includes a calculated summary. You can request an optional
        AI executive summary after saving; report creation and PDF export work
        without AI.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <Button disabled={busy} type="submit">
        {busy ? "Saving report…" : "Create report"}
      </Button>
    </form>
  );
}
