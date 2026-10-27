"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BusinessProfile } from "@/lib/business/constants";
import {
  IMPORT_TYPES,
  IMPORT_DEFINITIONS,
  IMPORT_LIMITS,
  type ImportType,
  type ImportPreview,
  type ImportHistoryItem,
} from "@/lib/imports/constants";

const inputClass =
  "mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm";
const instructions: Record<ImportType, string> = {
  PRODUCTS:
    "Use PRODUCT or SERVICE for type. Names already in your catalog, including archived items, cannot be imported again. Leave cost_price blank when unknown; zero means a known zero cost.",
  SALES:
    "Each row is one complete transaction for one product or service. item_name must uniquely match an active catalog item. Enter historical unit_cost or leave it blank if unknown. total_amount is optional; if supplied, it must match quantity × unit_price rounded to your currency.",
  EXPENSES:
    "Categories must already exist in this business. Their current classification is saved with each expense. Only Operating expenses reduce estimated profit; Inventory Purchase and Other spending remain separate.",
  CUSTOMER_METRICS:
    "Enter one nonnegative whole-number visit total per date, including repeat visits. Repeated dates in the file and dates already recorded are invalid. Use Customer Metrics to edit an existing day.",
  FEEDBACK:
    "Enter a date and up to 2,000 characters of feedback. Feedback starts as Pending analysis with Unknown sentiment.",
};
function resolution(row: ImportPreview["rows"][number], currency: string) {
  const v = row.resolved;
  if (!v) return null;
  if (v.totalAmount !== undefined)
    return `Matched: ${v.itemName}. Total: ${v.totalAmount} ${currency}. Unit cost: ${v.unitCost ?? "unknown"}.`;
  if (v.classification)
    return `Matched: ${v.categoryName}. Classification: ${String(v.classification).replaceAll("_", " ")}.`;
  return null;
}
export function ImportWorkspace({ business }: { business: BusinessProfile }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ImportType>("SALES");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ImportHistoryItem | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const definition = IMPORT_DEFINITIONS[type];
  const base = `/api/v1/businesses/${business.id}/imports`;
  const clearPreview = () => {
    setPreview(null);
    setConfirmed(false);
    setPage(1);
    setFilter("all");
    setError("");
    setSuccess(null);
  };
  async function submit(action: "preview" | "confirm") {
    if (!file || (action === "confirm" && (!preview || !confirmed))) return;
    setBusy(action);
    setError("");
    setSuccess(null);
    const form = new FormData();
    form.set("file", file);
    form.set("importType", type);
    if (action === "confirm") {
      form.set("token", preview!.token);
      form.set("confirmed", "true");
    }
    try {
      const response = await fetch(`${base}/${action}`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setPreview(null);
          setConfirmed(false);
        }
        throw new Error(
          result.message ??
            "The import could not be completed. Please try again.",
        );
      }
      if (action === "preview") {
        setPreview(result);
        setConfirmed(false);
        setPage(1);
        setFilter("all");
      } else {
        setSuccess(result.item);
        setPreview(null);
        setConfirmed(false);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        router.refresh();
      }
    } catch (error) {
      setError(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "Unable to reach Basira. Check your connection and try again. Check history before retrying an import.",
      );
    } finally {
      setBusy(null);
    }
  }
  const rows =
    preview?.rows.filter(
      (row) =>
        filter === "all" ||
        (filter === "invalid"
          ? row.errors.length > 0
          : row.errors.length === 0),
    ) ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border bg-card p-5 sm:p-7"
        aria-labelledby="upload-heading"
        aria-busy={!!busy}
      >
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-accent p-3 text-primary">
            <Upload size={22} aria-hidden="true" />
          </span>
          <div>
            <h2 id="upload-heading" className="text-lg font-semibold">
              Upload business data
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose a template, review every row, then confirm.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <label className="text-sm font-medium" htmlFor="import-type">
              Data type
            </label>
            <select
              id="import-type"
              className={inputClass}
              value={type}
              disabled={!!busy}
              onChange={(event) => {
                setType(event.target.value as ImportType);
                clearPreview();
              }}
            >
              {IMPORT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {IMPORT_DEFINITIONS[value].label}
                </option>
              ))}
            </select>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {instructions[type]}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium text-primary">
              <a href={`${base}/template?type=${type}&format=csv`} download>
                Download CSV template
              </a>
              <a href={`${base}/template?type=${type}&format=xlsx`} download>
                Download XLSX template
              </a>
            </div>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium">
                Column guide and example
              </summary>
              <p className="mt-2 text-muted-foreground">
                Templates contain headings only. This example explains the
                format; replace it with your own data.
              </p>
              <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                {definition.columns.map((column, index) => (
                  <div key={column} className="contents">
                    <dt className="break-words font-mono text-xs">
                      {column}
                      {(definition.required as readonly string[]).includes(
                        column,
                      )
                        ? " *"
                        : ""}
                    </dt>
                    <dd className="break-words">{definition.example[index]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-muted-foreground">
                * Required column. Dates: YYYY-MM-DD. Numbers: a decimal point,
                no thousands separators or currency symbols. Refunds and
                negative adjustments are not supported.
              </p>
            </details>
          </div>
          <div className="rounded-xl border border-dashed bg-background/60 p-5">
            <FileSpreadsheet
              className="mb-3 text-primary"
              aria-hidden="true"
              size={26}
            />
            <label className="block text-sm font-medium" htmlFor="import-file">
              CSV or XLSX file
            </label>
            <input
              ref={fileInput}
              id="import-file"
              type="file"
              accept=".csv,.xlsx"
              className={
                inputClass +
                " file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-accent-foreground"
              }
              disabled={!!busy}
              aria-describedby="file-help"
              onChange={(event) => {
                clearPreview();
                const chosen = event.target.files?.[0] ?? null;
                if (chosen && chosen.size > IMPORT_LIMITS.fileBytes) {
                  setFile(null);
                  setError("Choose a file no larger than 2 MiB.");
                } else setFile(chosen);
              }}
            />
            <p
              id="file-help"
              className="mt-3 text-sm leading-6 text-muted-foreground"
            >
              Up to 2 MiB and 1,000 data rows. UTF-8 CSV or one plain XLSX
              worksheet. Replace formulas with values; remove merged cells,
              links, images, extra sheets, and unused formatting.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              All amounts use {business.currency}. Dates belong to{" "}
              {business.timezone}; dates are not shifted between timezones.
            </p>
            <Button
              className="mt-5"
              disabled={!file || !!busy}
              onClick={() => void submit("preview")}
            >
              {busy === "preview" ? "Reading file…" : "Preview file"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Previewing does not save records. Raw files are not retained by
              Basira.
            </p>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {success && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-primary/25 bg-accent p-4"
          >
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 size={18} aria-hidden="true" />
              Import complete: {success.importedRows} imported,{" "}
              {success.failedRows} skipped.
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <Link
                className="text-primary underline"
                href={`/imports/${success.id}?business=${business.id}`}
              >
                View import result
              </Link>
              <Link
                className="text-primary underline"
                href={`/${IMPORT_DEFINITIONS[success.importType].resource}`}
              >
                View imported records
              </Link>
              <Link className="text-primary underline" href="/">
                View overview
              </Link>
            </div>
          </div>
        )}
      </section>
      {preview && (
        <section
          className="min-w-0 rounded-2xl border bg-card p-5 sm:p-7"
          aria-labelledby="preview-heading"
        >
          <h2 id="preview-heading" className="text-lg font-semibold">
            Review your import
          </h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {preview.fileName} · {definition.label} · {business.name}
          </p>
          <div role="status" className="my-5 grid grid-cols-3 gap-3">
            {[
              ["Total rows", preview.totalRows],
              ["Valid rows", preview.validRows],
              ["Invalid rows", preview.invalidRows],
            ].map(([label, count]) => (
              <div key={label} className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{count}</p>
              </div>
            ))}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Review values, matches, and warnings below. Invalid rows will be
            skipped. Correct them in your file, then upload only those corrected
            rows later to avoid duplicating rows already imported. This preview
            expires in 15 minutes.
          </p>
          <label className="text-sm font-medium" htmlFor="row-filter">
            Show rows
          </label>
          <select
            id="row-filter"
            className={inputClass + " mb-4 sm:max-w-60"}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All rows</option>
            <option value="invalid">Invalid rows</option>
            <option value="valid">Valid rows</option>
          </select>
          <div
            className="overflow-x-auto rounded-lg border"
            tabIndex={0}
            role="region"
            aria-label="Import preview rows"
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                File row numbers, values and validation results
              </caption>
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-3">Row</th>
                  {preview.headers.map((header) => (
                    <th key={header} className="p-3 font-medium">
                      {header}
                    </th>
                  ))}
                  <th className="p-3">Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * 25, page * 25).map((row) => (
                  <tr key={row.row} className="border-t align-top">
                    <th scope="row" className="p-3 font-medium">
                      {row.row}
                    </th>
                    {preview.headers.map((header) => (
                      <td
                        className="max-w-64 min-w-24 p-3 break-words whitespace-pre-wrap"
                        key={header}
                      >
                        {row.values[header] || "—"}
                      </td>
                    ))}
                    <td className="min-w-64 p-3">
                      <p
                        className={
                          row.errors.length
                            ? "font-medium text-destructive"
                            : "font-medium text-primary"
                        }
                      >
                        {row.errors.length ? "Invalid" : "Valid"}
                      </p>
                      {resolution(row, preview.currency) && (
                        <p className="mt-1">
                          {resolution(row, preview.currency)}
                        </p>
                      )}
                      {row.errors.map((message, index) => (
                        <p key={index} className="mt-1 text-destructive">
                          {message}
                        </p>
                      ))}
                      {row.warnings.map((message, index) => (
                        <p key={index} className="mt-1 text-muted-foreground">
                          Warning: {message}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-4 text-muted-foreground">
                No rows match this filter.
              </p>
            )}
          </div>
          <div className="my-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              {rows.length} rows · Page {page} of {pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous rows
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next rows
              </Button>
            </div>
          </div>
          {preview.validRows ? (
            <div className="border-t pt-5">
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  className="mt-1 size-4 shrink-0 accent-primary"
                  type="checkbox"
                  checked={confirmed}
                  disabled={!!busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I reviewed the preview. Import {preview.validRows} valid rows
                  into {business.name} and skip {preview.invalidRows} invalid
                  rows.
                </span>
              </label>
              <Button
                className="mt-4"
                disabled={!confirmed || !!busy}
                onClick={() => void submit("confirm")}
              >
                {busy === "confirm" ? "Importing…" : "Confirm import"}
              </Button>
            </div>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              No valid rows. Correct the file and preview it again.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
