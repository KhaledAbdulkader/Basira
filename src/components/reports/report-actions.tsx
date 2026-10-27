"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ReportView } from "@/lib/reports/contracts";
export function ReportActions({
  businessId,
  report,
}: {
  businessId: string;
  report: ReportView;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function summarize() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/reports/${report.id}/summary`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Unable to request an AI summary.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check your connection and try again. The saved report is available.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Report actions"
      className="rounded-2xl border bg-card p-5 space-y-4"
    >
      <div className="flex flex-wrap gap-3">
        <a
          href={`/api/v1/businesses/${businessId}/reports/${report.id}/pdf`}
          className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Download PDF
        </a>
        {report.aiStatus !== "COMPLETED" && (
          <Button
            variant="outline"
            disabled={busy || !report.retryable}
            onClick={summarize}
          >
            {busy
              ? "Writing AI summary…"
              : report.aiStatus === "NOT_REQUESTED"
                ? "Generate AI executive summary"
                : "Retry AI summary"}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => router.refresh()}
        >
          Refresh status
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        AI is optional. Requesting it shares this saved report's aggregate
        metrics, historical product/category names, feedback counts, forecast
        summaries and recent alerts with NVIDIA-hosted Gemma. Business name,
        owner details, raw transactions and individual comments are excluded.
        Calls can take up to 60 seconds; the saved report and PDF remain
        available. One request per minute per business.
      </p>
      {report.aiStatus === "FAILED" && (
        <p role="status" className="text-sm">
          AI summary unavailable (
          {report.aiError?.toLowerCase().replaceAll("_", " ")}). The calculated
          summary and PDF remain available.
        </p>
      )}
      {report.aiStatus === "PENDING" && (
        <p role="status" className="text-sm">
          AI summary pending. Refresh to check its status; an interrupted
          request can be retried after its recovery window.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
