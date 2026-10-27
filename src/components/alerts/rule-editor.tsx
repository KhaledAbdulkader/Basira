"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputStyle } from "@/components/records/record-editor";
import { RULES, type RuleView } from "@/lib/alerts/contracts";

export function RuleEditor({
  businessId,
  rule,
}: {
  businessId: string;
  rule: RuleView;
}) {
  const router = useRouter(),
    policy = RULES[rule.type];
  const [enabled, setEnabled] = useState(rule.enabled),
    [threshold, setThreshold] = useState(rule.threshold);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/alert-rules/${rule.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: rule.version, enabled, threshold }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Unable to save this rule.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      aria-label={policy.label}
      onSubmit={save}
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h2 className="text-lg font-semibold">{policy.label}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {policy.description}
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-5">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={busy}
          />
          Enabled
        </label>
        <label className="max-w-44 text-sm font-medium">
          Threshold (%)
          <input
            className={inputStyle}
            type="number"
            min={policy.min}
            max={policy.max}
            step="0.01"
            required
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            disabled={busy}
          />
        </label>
        <Button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save rule"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
