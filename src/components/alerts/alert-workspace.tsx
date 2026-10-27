"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputStyle } from "@/components/records/record-editor";
import { ALERT_TYPES, RULES } from "@/lib/alerts/contracts";
import type { AlertsWorkspace } from "@/lib/alerts/service";
import { formatDate } from "@/lib/dashboard/format";

export function AlertWorkspace({
  businessId,
  data,
}: {
  businessId: string;
  data: AlertsWorkspace;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function mutate(path: string, body: object, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/alerts/${path}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Unable to update alerts.");
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
  const pageLink = (page: number) =>
    `/alerts?${new URLSearchParams({ page: String(page), status: data.status, type: data.type })}`;
  return (
    <div className="min-w-0 space-y-6">
      <div className="grid grid-cols-3 gap-3" aria-label="Alert counts">
        {(["unread", "read", "dismissed"] as const).map((status) => (
          <div key={status} className="rounded-xl border bg-card p-4">
            <p className="text-xs capitalize text-muted-foreground">{status}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {data.counts[status]}
            </p>
          </div>
        ))}
      </div>
      <section
        className="rounded-2xl border bg-card p-5"
        aria-label="Current rule checks"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Current rule checks</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {formatDate(data.period.from)} – {formatDate(data.period.to)}.
              Comparisons use the preceding equal period. Today is excluded;
              forecast alerts use their own future dates.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => mutate("evaluate", {})}
          >
            Check alerts now
          </Button>
        </div>
        <ul className="mt-4 divide-y">
          {data.evaluations.map((r) => (
            <li key={r.type} className="py-3 text-sm">
              <p className="font-medium">
                {RULES[r.type].label}{" "}
                <span className="font-normal text-muted-foreground">
                  · {r.state.toLowerCase().replaceAll("_", " ")}
                  {r.measuredPercent !== null ? ` · ${r.measuredPercent}%` : ""}
                </span>
              </p>
              <p className="mt-1 leading-6 text-muted-foreground">
                {r.explanation}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Percentages are rounded for display; thresholds use unrounded values.
          These checks use recorded data and do not prove that all activity has
          been entered.
        </p>
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-xl border bg-card p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <section aria-label="Alert history" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Alert history</h2>
          <Button
            variant="outline"
            disabled={busy || data.counts.unread === 0}
            onClick={() => mutate("read-all", {})}
          >
            Mark all as read
          </Button>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Each alert preserves what was observed when it first triggered. Later
          edits or rule changes do not rewrite it. Reading or dismissing an
          alert acknowledges it; it does not resolve the condition. “Mark all”
          applies to this entire business.
        </p>
        <form
          action="/alerts"
          className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
        >
          <div className="text-sm">
            <label htmlFor="alert-status">Status</label>
            <select
              id="alert-status"
              name="status"
              className={inputStyle}
              defaultValue={data.status}
              key={`status-${data.status}`}
            >
              <option value="ALL">All statuses</option>
              <option value="UNREAD">Unread</option>
              <option value="READ">Read</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>
          <div className="min-w-0 text-sm">
            <label htmlFor="alert-type">Alert type</label>
            <select
              id="alert-type"
              name="type"
              className={inputStyle}
              defaultValue={data.type}
              key={`type-${data.type}`}
            >
              <option value="ALL">All types</option>
              {ALERT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RULES[type].label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            Apply filters
          </Button>
        </form>
        {!data.items.length && (
          <p className="rounded-xl border bg-card p-6 text-sm">
            No alerts match these filters. Review the rule checks above for
            missing data or disabled rules.
          </p>
        )}
        {data.items.map((alert) => (
          <article
            key={alert.id}
            aria-label={alert.title}
            className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold">{alert.title}</h3>
              <span className="rounded-full border px-3 py-1 text-xs capitalize">
                {alert.severity.toLowerCase()} · {alert.status.toLowerCase()}
              </span>
            </div>
            <p className="mt-3 text-sm leading-7">{alert.message}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatDate(alert.periodFrom)} – {formatDate(alert.periodTo)} ·{" "}
              {alert.evidence.timezone} · Saved{" "}
              {alert.createdAt.replace("T", " ").slice(0, 19)} UTC
            </p>
            <details className="mt-4 rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                View triggering data
              </summary>
              <p className="mt-3">
                Threshold: {alert.evidence.threshold}% · Observed:{" "}
                {alert.evidence.measuredPercent}%
              </p>
              {alert.evidence.comparisonFrom && (
                <p className="mt-2">
                  Baseline dates: {formatDate(alert.evidence.comparisonFrom)} –{" "}
                  {formatDate(alert.evidence.comparisonTo!)}.
                </p>
              )}
              <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-6">
                {[...alert.evidence.details, ...alert.evidence.limitations].map(
                  (s, i) => (
                    <li key={i}>{s}</li>
                  ),
                )}
              </ul>
              {alert.evidence.forecastId && (
                <Link
                  href={`/forecasts/${alert.evidence.forecastId}`}
                  className="mt-3 inline-block text-primary underline"
                >
                  View saved forecast
                </Link>
              )}
            </details>
            {alert.status !== "DISMISSED" && (
              <div className="mt-4 flex flex-wrap gap-2">
                {alert.status === "UNREAD" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        alert.id,
                        { version: alert.version, status: "READ" },
                        "PATCH",
                      )
                    }
                  >
                    Mark as read
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      alert.id,
                      { version: alert.version, status: "DISMISSED" },
                      "PATCH",
                    )
                  }
                >
                  Dismiss alert
                </Button>
              </div>
            )}
          </article>
        ))}
        <nav
          aria-label="Alert history pages"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p>
            {data.total} alerts · Page {data.page} of{" "}
            {Math.max(1, Math.ceil(data.total / data.pageSize))}
          </p>
          <div className="flex gap-4">
            {data.page > 1 && (
              <Link
                className="text-primary underline"
                href={pageLink(data.page - 1)}
              >
                Previous alerts
              </Link>
            )}
            {data.page * data.pageSize < data.total && (
              <Link
                className="text-primary underline"
                href={pageLink(data.page + 1)}
              >
                Next alerts
              </Link>
            )}
          </div>
        </nav>
      </section>
    </div>
  );
}
