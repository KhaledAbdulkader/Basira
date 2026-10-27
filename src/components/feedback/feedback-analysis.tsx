"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  analysisErrorMessage,
  BATCH_SIZE,
  type AnalysisBatchResult,
  type FeedbackInsights,
} from "@/lib/feedback/contracts";
import type { RecordView } from "@/lib/records/types";

function AnalysisButton({
  businessId,
  mode,
  record,
  disabled = false,
  children,
}: {
  businessId: string;
  mode: "PENDING" | "FAILED" | "SINGLE";
  record?: RecordView;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function analyze() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/feedback-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "SINGLE"
              ? { mode, recordId: record!.id, version: record!.version }
              : { mode },
          ),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.message ?? "Unable to analyze feedback. Try again later.",
        );
      const result = body as AnalysisBatchResult;
      setMessage(
        result.attempted
          ? `${result.analyzed} analyzed · ${result.failed} failed · ${result.skipped} changed or interrupted. Wait one minute before the next batch.`
          : "No feedback to analyze.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connection interrupted. Refresh in 150 seconds before retrying.",
      );
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <div className="min-w-0 space-y-2">
      <Button
        type="button"
        variant={mode === "PENDING" ? "default" : "outline"}
        size="sm"
        disabled={disabled || busy}
        onClick={analyze}
      >
        {busy ? "Analyzing…" : children}
      </Button>
      {busy && (
        <p role="status" className="max-w-md text-xs text-muted-foreground">
          This can take up to 60 seconds. Keep this page open.
        </p>
      )}
      {message && (
        <p role="status" className="max-w-md text-xs leading-5">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="max-w-md text-xs leading-5 text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function FeedbackAnalysisPanel({
  businessId,
  insights,
}: {
  businessId: string;
  insights: FeedbackInsights;
}) {
  const recurring = (kind: "positive" | "negative") =>
    insights.topics
      .filter((t) => t[kind] >= 2)
      .sort((a, b) => b[kind] - a[kind] || a.topic.localeCompare(b.topic))
      .slice(0, 5);
  return (
    <section
      className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6"
      aria-label="Feedback insights"
    >
      <div>
        <h2 className="text-xl font-semibold">Feedback insights</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          All dates in this business, regardless of table filters.{" "}
          {insights.analyzed} of {insights.total} comments analyzed ·{" "}
          {insights.pending} pending · {insights.failed} failed.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {insights.sentiments.map((item) => (
          <div
            key={item.sentiment}
            className="rounded-xl border bg-background p-4"
          >
            <h3 className="text-sm capitalize">
              {item.sentiment.toLowerCase()}
            </h3>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {item.count}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {item.percent === null
                  ? "No analyzed data"
                  : `${item.percent}% of analyzed`}
              </span>
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <TopicList
          title="Common topics"
          rows={insights.topics
            .slice(0, 5)
            .map((t) => ({ name: t.topic, count: t.count }))}
          empty="Analyze feedback to see common topics."
        />
        <TopicList
          title="Repeated complaint topics"
          rows={recurring("negative").map((t) => ({
            name: t.topic,
            count: t.negative,
          }))}
          empty="No topic has two analyzed negative comments yet."
        />
        <TopicList
          title="Repeated positive themes"
          rows={recurring("positive").map((t) => ({
            name: t.topic,
            count: t.positive,
          }))}
          empty="No topic has two analyzed positive comments yet."
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Each comment has one main topic. Repeated topics mean at least two
        comments with that sentiment; they may describe different experiences.
        Percentages exclude pending and failed feedback and may not total
        exactly 100% after rounding.
      </p>
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm leading-6">
          Analyzing sends the selected feedback text to NVIDIA’s hosted Google
          Gemma model. Remove names, contact details and sensitive information
          first. Original comments stay unchanged.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Up to {BATCH_SIZE} oldest comments per batch, once a minute. Imported
          comments wait for you to start analysis. AI summaries are in English
          and may be wrong. Classification strength reflects the model’s own
          assessment, not measured accuracy.
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <AnalysisButton
            businessId={businessId}
            mode="PENDING"
            disabled={!insights.pending || insights.inProgress > 0}
          >
            Analyze pending feedback
          </AnalysisButton>
          <AnalysisButton
            businessId={businessId}
            mode="FAILED"
            disabled={!insights.failed || insights.inProgress > 0}
          >
            Retry failed feedback
          </AnalysisButton>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Refresh analysis
          </Button>
        </div>
        {insights.inProgress > 0 && (
          <p role="status" className="text-sm">
            {insights.inProgress} comments are being analyzed. Refresh shortly.
            Interrupted requests become available within 150 seconds.
          </p>
        )}
      </div>
    </section>
  );
}

function TopicList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { name: string; count: number }[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.name} className="flex justify-between gap-3">
              <span className="capitalize">{row.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export function FeedbackAnalysisDetail({
  businessId,
  record,
}: {
  businessId: string;
  record: RecordView;
}) {
  if (record.analysisStatus === "ANALYZED")
    return (
      <div className="min-w-56 max-w-80 space-y-2 whitespace-normal">
        <p className="font-medium capitalize">
          {String(record.sentiment).toLowerCase()} ·{" "}
          {String(record.topic ?? "other")}
        </p>
        <p className="text-sm leading-6">
          {String(record.aiSummary ?? "Summary unavailable.")}
        </p>
        <p className="text-xs text-muted-foreground">
          Classification strength:{" "}
          {record.confidence === null
            ? "Unavailable"
            : `${Math.round(Number(record.confidence) * 100)}%`}
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Analysis details</summary>
          <p className="mt-2 break-words">
            {String(record.analysisProvider ?? "Unknown provider")} ·{" "}
            {String(record.analysisModel ?? "Unknown model")}
          </p>
          <p>
            {record.analyzedAt
              ? `${String(record.analyzedAt).replace("T", " ").slice(0, 19)} UTC`
              : "Time unavailable"}{" "}
            · {String(record.analysisPromptVersion ?? "Unknown prompt version")}
          </p>
          <p className="mt-2">Editing this entry clears its analysis.</p>
        </details>
      </div>
    );
  return (
    <div className="min-w-48 max-w-72 space-y-3 whitespace-normal">
      <p>
        {record.analysisStatus === "FAILED"
          ? "Analysis failed"
          : "Pending analysis"}
      </p>
      {record.analysisStatus === "FAILED" && (
        <p className="text-xs leading-5 text-red-700 dark:text-red-300">
          {analysisErrorMessage(String(record.analysisError))}
        </p>
      )}
      <AnalysisButton businessId={businessId} mode="SINGLE" record={record}>
        {record.analysisStatus === "FAILED"
          ? "Retry analysis"
          : "Analyze comment"}
      </AnalysisButton>
    </div>
  );
}
