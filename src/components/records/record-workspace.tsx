"use client";

import Link from "next/link";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BusinessProfile } from "@/lib/business/constants";
import {
  CLASSIFICATIONS,
  RECORD_LABELS,
  classificationLabel,
  type RecordList,
  type RecordOptions,
  type RecordResource,
  type RecordValue,
  type RecordView,
} from "@/lib/records/types";
import type { RecordQuery } from "@/lib/validation/records";
import { currencyPrecision, Decimal } from "@/lib/records/money";
import { inputStyle, RecordEditor } from "./record-editor";
import {
  FeedbackAnalysisDetail,
  FeedbackAnalysisPanel,
} from "@/components/feedback/feedback-analysis";
import type { FeedbackInsights } from "@/lib/feedback/contracts";

const columns: Record<RecordResource, [string, string][]> = {
  products: [
    ["name", "Item"],
    ["sellingPrice", "Price"],
    ["costPrice", "Unit cost"],
    ["active", "Status"],
    ["type", "Type"],
    ["category", "Category"],
  ],
  sales: [
    ["saleDate", "Date"],
    ["itemName", "Item at sale"],
    ["totalAmount", "Total"],
    ["quantity", "Quantity"],
    ["unitPrice", "Unit price"],
    ["unitCost", "Unit cost"],
  ],
  "expense-categories": [
    ["name", "Category"],
    ["classification", "Treatment"],
    ["isDefault", "Origin"],
  ],
  expenses: [
    ["expenseDate", "Date"],
    ["categoryName", "Category"],
    ["amount", "Amount"],
    ["description", "Description"],
    ["classification", "Recorded treatment"],
  ],
  "customer-metrics": [
    ["metricDate", "Date"],
    ["customerCount", "Customer visits"],
  ],
  feedback: [
    ["feedbackDate", "Date"],
    ["feedbackText", "Feedback"],
    ["analysisStatus", "Analysis"],
  ],
};
function display(
  key: string,
  value: RecordValue | undefined,
  currency: string,
) {
  if (value === null || value === undefined || value === "")
    return key === "unitCost" || key === "costPrice"
      ? "Unknown"
      : key === "itemName"
        ? "Unlinked sale"
        : "—";
  if (
    [
      "sellingPrice",
      "costPrice",
      "unitPrice",
      "unitCost",
      "totalAmount",
      "amount",
    ].includes(key)
  ) {
    const decimal = new Decimal(String(value));
    return `${currency} ${decimal.toFixed(Math.max(currencyPrecision(currency), decimal.decimalPlaces()))}`;
  }
  if (key === "classification") return classificationLabel(value);
  if (key === "active") return value ? "Active" : "Archived";
  if (key === "isDefault") return value ? "Default" : "Custom";
  if (key === "type") return value === "PRODUCT" ? "Product" : "Service";
  if (key === "analysisStatus")
    return value === "PENDING" ? "Pending analysis" : String(value);
  return String(value);
}

export function RecordWorkspace({
  business,
  resource,
  result,
  options,
  query,
  today,
  saved,
  feedbackInsights,
}: {
  business: BusinessProfile;
  resource: RecordResource;
  result: RecordList;
  options: RecordOptions;
  query: RecordQuery;
  today: string;
  saved: boolean;
  feedbackInsights?: FeedbackInsights;
}) {
  const label = RECORD_LABELS[resource];
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageLink = (page: number) => {
    const params = new URLSearchParams(
      Object.entries({ ...query, page })
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, String(value)]),
    );
    return `/${resource}?${params}`;
  };
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="mb-2 break-words text-xs font-medium text-primary">
            {business.name} · {business.currency}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {label.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {label.description}
          </p>
        </div>
        <RecordEditor
          resource={resource}
          business={business}
          options={options}
          today={today}
        />
      </div>
      {saved && (
        <p
          role="status"
          className="rounded-xl border border-primary/25 bg-accent px-4 py-3 text-sm"
        >
          Record saved.
        </p>
      )}
      {resource === "expenses" && (
        <Link
          href="/expense-categories"
          className="inline-flex items-center gap-2 rounded text-sm font-medium text-primary hover:underline"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Manage expense categories
        </Link>
      )}
      {resource === "expense-categories" && (
        <Link href="/expenses" className="text-sm text-primary hover:underline">
          Back to expenses
        </Link>
      )}
      {resource === "feedback" && feedbackInsights && (
        <FeedbackAnalysisPanel
          businessId={business.id}
          insights={feedbackInsights}
        />
      )}
      <form
        action={`/${resource}`}
        className="flex flex-wrap items-end gap-4 rounded-2xl border bg-card p-5"
        aria-label="Record filters"
      >
        {resource !== "customer-metrics" && (
          <label className="min-w-40 flex-1 text-xs font-medium">
            Search
            <input
              name="search"
              className={inputStyle}
              defaultValue={query.search}
              maxLength={120}
              placeholder={
                resource === "sales"
                  ? "Item or note"
                  : resource === "expenses"
                    ? "Description"
                    : "Search records"
              }
            />
          </label>
        )}
        {label.dateField && (
          <>
            <label className="text-xs font-medium">
              From
              <input
                name="from"
                type="date"
                className={inputStyle}
                defaultValue={query.from}
                min="1000-01-01"
                max="9999-12-31"
              />
            </label>
            <label className="text-xs font-medium">
              To
              <input
                name="to"
                type="date"
                className={inputStyle}
                defaultValue={query.to}
                min="1000-01-01"
                max="9999-12-31"
              />
            </label>
          </>
        )}
        {resource === "products" && (
          <>
            <label className="min-w-32 text-xs font-medium">
              Status
              <select
                name="active"
                className={inputStyle}
                defaultValue={query.active}
              >
                <option value="all">All items</option>
                <option value="true">Active</option>
                <option value="false">Archived</option>
              </select>
            </label>
            <label className="min-w-36 text-xs font-medium">
              Category
              <select
                name="category"
                className={inputStyle}
                defaultValue={query.category ?? ""}
              >
                <option value="">All categories</option>
                {options.productCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {resource === "sales" && (
          <label className="min-w-40 text-xs font-medium">
            Product filter
            <select
              name="productId"
              className={inputStyle}
              defaultValue={query.productId ?? ""}
            >
              <option value="">All products</option>
              {options.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.active ? "" : " (archived)"}
                </option>
              ))}
            </select>
          </label>
        )}
        {resource === "expenses" && (
          <label className="min-w-40 text-xs font-medium">
            Category filter
            <select
              name="categoryId"
              className={inputStyle}
              defaultValue={query.categoryId ?? ""}
            >
              <option value="">All categories</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="min-w-28 text-xs font-medium">
          Sort by
          <select name="sort" className={inputStyle} defaultValue={query.sort}>
            {label.dateField ? (
              <option value="date">Date</option>
            ) : (
              <option value="date">Name</option>
            )}
            {["products", "sales", "expenses"].includes(resource) && (
              <option value="amount">Amount</option>
            )}
          </select>
        </label>
        <label className="min-w-28 text-xs font-medium">
          Order
          <select
            name="order"
            className={inputStyle}
            defaultValue={query.order}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Rows
          <select
            name="pageSize"
            className={inputStyle}
            defaultValue={query.pageSize}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        <Link
          href={`/${resource}`}
          className="mb-3 rounded text-xs text-primary hover:underline"
        >
          Reset
        </Link>
      </form>
      <section
        className="min-w-0 overflow-hidden rounded-2xl border bg-card"
        aria-label={label.title}
      >
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">
            {result.total.toLocaleString()}{" "}
            {result.total === 1 ? "record" : "records"}
          </h2>
          <span className="text-xs text-muted-foreground">
            Page {result.page} of {pages}
          </span>
        </div>
        {result.records.length > 0 && (
          <p className="border-b px-5 py-3 text-xs text-muted-foreground lg:hidden">
            Swipe across the table to see all details and actions.
          </p>
        )}
        {!result.records.length ? (
          <div className="px-6 py-14 text-center">
            <FileText
              className="mx-auto mb-4 size-8 text-primary"
              aria-hidden="true"
            />
            <h3 className="text-lg font-medium">No matching records</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add your first {label.singular}, or adjust the filters.
            </p>
          </div>
        ) : (
          <div
            className="overflow-x-auto"
            role="region"
            aria-label={`${label.title} table`}
            tabIndex={0}
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {label.title} for {business.name}
              </caption>
              <thead className="bg-background text-xs text-muted-foreground">
                <tr>
                  {columns[resource].map(([key, title]) => (
                    <th
                      scope="col"
                      key={key}
                      className="px-5 py-3 font-medium whitespace-nowrap"
                    >
                      {title}
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.records.map((record) => (
                  <tr key={record.id} className="align-top hover:bg-accent/25">
                    {columns[resource].map(([key]) => (
                      <td
                        key={key}
                        className={`px-5 py-4 ${["feedbackText", "description", "name", "itemName"].includes(key) ? "min-w-44 max-w-80 break-words whitespace-pre-wrap" : "whitespace-nowrap tabular-nums"}`}
                      >
                        {key === "analysisStatus" ? (
                          <FeedbackAnalysisDetail
                            businessId={business.id}
                            record={record}
                          />
                        ) : key === "feedbackText" ? (
                          <p
                            className="line-clamp-4"
                            title={String(record[key])}
                          >
                            {display(key, record[key], business.currency)}
                          </p>
                        ) : (
                          display(key, record[key], business.currency)
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <RecordEditor
                          resource={resource}
                          business={business}
                          options={options}
                          today={today}
                          record={record}
                        />
                        {resource !== "products" && (
                          <DeleteRecord
                            businessId={business.id}
                            resource={resource}
                            record={record}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
          <span className="text-xs text-muted-foreground">
            Dates use {business.timezone}.
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageLink(result.page - 1)}>Previous</Link>
              </Button>
            )}
            {result.page < pages && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageLink(result.page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
      {resource === "sales" && (
        <p className="text-xs leading-6 text-muted-foreground">
          Unknown unit costs remain missing data. Zero-cost sales are known
          costs. Refunds and negative adjustments are not supported.
        </p>
      )}
      {resource === "expense-categories" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {CLASSIFICATIONS.map((item) => (
            <div key={item.value} className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-medium">{item.label}</h3>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {item.value === "OPERATING"
                  ? "Day-to-day running costs, such as rent and salaries."
                  : item.value === "INVENTORY_PURCHASE"
                    ? "Purchases of goods for sale. Kept separate to avoid counting the cost of sold goods twice."
                    : "Spending that still needs a clear classification; disclosed separately."}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteRecord({
  businessId,
  resource,
  record,
}: {
  businessId: string;
  resource: RecordResource;
  record: RecordView;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const label = RECORD_LABELS[resource].singular;
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/${resource}/${record.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: record.version, confirmed }),
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message ?? "Unable to delete this record.");
      }
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete. Check your connection.",
      );
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setConfirmed(false);
          setError("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${label}`}
          className="text-red-700 dark:text-red-300"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-xl font-semibold">
            Delete this {label}?
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            This permanently removes the record. It cannot be undone.
          </Dialog.Description>
          <p className="mt-4 rounded-lg bg-background p-3 text-sm break-words">
            {String(
              record.name ??
                record.saleDate ??
                record.expenseDate ??
                record.metricDate ??
                record.feedbackDate,
            )}
            {record.totalAmount ? ` · ${record.totalAmount}` : ""}
          </p>
          <p className="mt-2 text-sm break-words text-muted-foreground">
            {String(
              record.feedbackText ??
                record.description ??
                record.itemName ??
                record.categoryName ??
                "",
            ).slice(0, 160)}
          </p>
          <label className="my-5 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            I understand this permanently deletes this record.
          </label>
          {error && (
            <div
              role="alert"
              className="mb-4 text-sm text-red-700 dark:text-red-300"
            >
              <p>{error}</p>
              <button
                type="button"
                className="mt-2 underline"
                onClick={() => window.location.reload()}
              >
                Reload latest records
              </button>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={busy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={remove}
              disabled={!confirmed || busy}
              className="bg-red-700 text-white hover:bg-red-800"
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
