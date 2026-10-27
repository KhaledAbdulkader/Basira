"use client";

import { useId, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import type { BusinessProfile } from "@/lib/business/constants";
import {
  CLASSIFICATIONS,
  RECORD_LABELS,
  classificationLabel,
  type RecordOptions,
  type RecordResource,
  type RecordView,
} from "@/lib/records/types";
import { calculateSaleTotal, currencyPrecision } from "@/lib/records/money";
import {
  categorySchema,
  customerMetricSchema,
  expenseSchema,
  feedbackSchema,
  productSchema,
  saleSchema,
} from "@/lib/validation/records";

export const inputStyle =
  "mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-2 focus:outline-primary disabled:opacity-60";
type Props = {
  resource: RecordResource;
  business: BusinessProfile;
  options: RecordOptions;
  today: string;
  record?: RecordView;
};

export function RecordEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = props.record ? "Edit" : "Add";
  const label = `${action} ${RECORD_LABELS[props.resource].singular}`;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value);
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant={props.record ? "ghost" : "default"}
          size={props.record ? "sm" : "default"}
        >
          {!props.record && <Plus aria-hidden="true" />}
          {label}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
          <Dialog.Title className="pr-8 text-xl font-semibold">
            {label}
          </Dialog.Title>
          <Dialog.Description className="mt-2 mb-6 text-sm leading-6 text-muted-foreground">
            {props.business.name} · {props.business.currency} ·{" "}
            {props.business.timezone}
          </Dialog.Description>
          <EntryForm {...props} onBusyChange={setBusy} />
          <Dialog.Close asChild>
            <Button
              aria-label="Close record form"
              variant="ghost"
              size="icon"
              disabled={busy}
              className="absolute top-3 right-3"
            >
              <X aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EntryForm({
  resource,
  business,
  options,
  today,
  record,
  onBusyChange,
}: Props & { onBusyChange: (busy: boolean) => void }) {
  const prefix = useId();
  const [values, setValues] = useState<Record<string, string>>(() => ({
    name: "",
    type: "PRODUCT",
    category: "",
    costPrice: "",
    sellingPrice: "",
    active: "true",
    classification: "OPERATING",
    saleDate: today,
    productServiceId: "",
    quantity: "1",
    unitPrice: "",
    unitCost: "",
    note: "",
    expenseDate: today,
    categoryId: "",
    amount: "",
    description: "",
    metricDate: today,
    customerCount: "",
    feedbackDate: today,
    feedbackText: "",
    ...Object.fromEntries(
      Object.entries(record ?? {}).map(([key, value]) => [
        key,
        value === null ? "" : String(value),
      ]),
    ),
    costMode: "EXPLICIT",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const set = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const value = (key: string) => values[key] ?? "";
  const nullable = (key: string) => value(key).trim() || null;
  function input(
    key: string,
    label: string,
    config: {
      type?: string;
      required?: boolean;
      maxLength?: number;
      decimal?: boolean;
    } = {},
  ) {
    return (
      <label
        key={key}
        htmlFor={`${prefix}-${key}`}
        className="block text-sm font-medium"
      >
        {label}
        <input
          id={`${prefix}-${key}`}
          name={key}
          className={inputStyle}
          type={config.type ?? "text"}
          inputMode={config.decimal ? "decimal" : undefined}
          required={config.required ?? true}
          maxLength={config.maxLength ?? 120}
          min={config.type === "date" ? "1000-01-01" : undefined}
          max={config.type === "date" ? "9999-12-31" : undefined}
          value={value(key)}
          onChange={(event) => set(key, event.target.value)}
        />
      </label>
    );
  }
  function select(
    key: string,
    label: string,
    choices: { value: string; label: string; disabled?: boolean }[],
    change?: (value: string) => void,
  ) {
    return (
      <label
        key={key}
        htmlFor={`${prefix}-${key}`}
        className="block text-sm font-medium"
      >
        {label}
        <select
          id={`${prefix}-${key}`}
          name={key}
          className={inputStyle}
          value={value(key)}
          onChange={(event) =>
            change ? change(event.target.value) : set(key, event.target.value)
          }
        >
          {choices.map((choice) => (
            <option
              key={choice.value}
              value={choice.value}
              disabled={choice.disabled}
            >
              {choice.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function textarea(
    key: string,
    label: string,
    maxLength: number,
    required = false,
  ) {
    return (
      <label htmlFor={`${prefix}-${key}`} className="block text-sm font-medium">
        {label}
        <textarea
          id={`${prefix}-${key}`}
          name={key}
          className={`${inputStyle} min-h-24 resize-y`}
          value={value(key)}
          onChange={(event) => set(key, event.target.value)}
          maxLength={maxLength}
          required={required}
        />
      </label>
    );
  }
  function payload() {
    switch (resource) {
      case "products":
        return productSchema.parse({
          name: value("name"),
          type: value("type"),
          category: nullable("category"),
          costPrice: nullable("costPrice"),
          sellingPrice: value("sellingPrice"),
          active: value("active") === "true",
        });
      case "expense-categories":
        return categorySchema.parse({
          name: value("name"),
          classification: value("classification"),
        });
      case "sales":
        return saleSchema.parse({
          saleDate: value("saleDate"),
          productServiceId: nullable("productServiceId"),
          quantity: value("quantity"),
          unitPrice: value("unitPrice"),
          unitCost:
            value("costMode") === "CATALOG" ? null : nullable("unitCost"),
          costMode: value("costMode"),
          note: nullable("note"),
        });
      case "expenses":
        return expenseSchema.parse({
          expenseDate: value("expenseDate"),
          categoryId: value("categoryId"),
          amount: value("amount"),
          description: nullable("description"),
        });
      case "customer-metrics":
        return customerMetricSchema.parse({
          metricDate: value("metricDate"),
          customerCount: /^\d+$/.test(value("customerCount"))
            ? Number(value("customerCount"))
            : NaN,
        });
      case "feedback":
        return feedbackSchema.parse({
          feedbackDate: value("feedbackDate"),
          feedbackText: value("feedbackText"),
        });
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setConflict(false);
    try {
      const data = payload();
      setBusy(true);
      onBusyChange(true);
      const response = await fetch(
        `/api/v1/businesses/${business.id}/${resource}${record ? `/${record.id}` : ""}`,
        {
          method: record ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            ...(record ? { version: record.version } : {}),
          }),
        },
      );
      if (!response.ok) {
        const result = await response.json();
        setConflict(response.status === 409);
        throw new Error(result.message ?? "Unable to save this record.");
      }
      const url = new URL(window.location.href);
      url.searchParams.set("saved", "1");
      window.location.assign(url);
    } catch (cause) {
      setError(
        cause instanceof ZodError
          ? (cause.issues[0]?.message ?? "Check the form.")
          : cause instanceof Error
            ? cause.message
            : "Unable to save. Check your connection and try again.",
      );
      setBusy(false);
      onBusyChange(false);
    }
  }
  let total = "—";
  if (
    resource === "sales" &&
    /^\d+(\.\d{1,3})?$/.test(value("quantity")) &&
    /^\d+(\.\d{1,4})?$/.test(value("unitPrice"))
  ) {
    try {
      total = calculateSaleTotal(
        value("quantity"),
        value("unitPrice"),
        business.currency,
      ).toFixed(currencyPrecision(business.currency));
    } catch {
      /* Incomplete/oversized input is validated on submission. */
    }
  }
  return (
    <form onSubmit={submit} aria-busy={busy} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        {resource === "products" && (
          <>
            {input("name", "Item name")}
            {select("type", "Item type", [
              { value: "PRODUCT", label: "Product" },
              { value: "SERVICE", label: "Service" },
            ])}
            {input("category", "Product category (optional)", {
              required: false,
              maxLength: 80,
            })}
            <div className="grid gap-5 sm:grid-cols-2">
              {input("sellingPrice", "Selling price", { decimal: true })}
              {input("costPrice", "Unit cost (optional)", {
                decimal: true,
                required: false,
              })}
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              Leave cost blank when unknown; enter 0 only for a known zero cost.
              Catalog price changes do not change recorded sales. Adding a
              priced item locks the business currency and timezone.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-1 size-4 accent-primary"
                type="checkbox"
                checked={value("active") === "true"}
                onChange={(event) =>
                  set("active", String(event.target.checked))
                }
              />
              Active — available for new sales. Uncheck to archive.
            </label>
          </>
        )}
        {resource === "expense-categories" && (
          <>
            {input("name", "Category name", { maxLength: 80 })}
            {select("classification", "Expense classification", [
              ...CLASSIFICATIONS,
            ])}
            <p className="text-xs leading-6 text-muted-foreground">
              Operating expenses and the historical cost of sold goods are
              deducted when estimating profit. Inventory purchases and Other
              spending are tracked separately. Existing expenses keep their
              recorded classification.
            </p>
          </>
        )}
        {resource === "sales" && (
          <>
            {input("saleDate", "Sale date", { type: "date" })}
            {select(
              "productServiceId",
              "Product or service",
              [
                { value: "", label: "Unlinked sale" },
                ...options.products
                  .filter(
                    (product) =>
                      product.active || product.id === record?.productServiceId,
                  )
                  .map((product) => ({
                    value: product.id,
                    label: `${product.name}${product.active ? "" : " (archived)"}`,
                  })),
              ],
              (id) => {
                const product = options.products.find((item) => item.id === id);
                setValues((current) => ({
                  ...current,
                  productServiceId: id,
                  ...(product
                    ? {
                        unitPrice: product.sellingPrice,
                        unitCost: product.costPrice ?? "",
                        costMode: "CATALOG",
                      }
                    : { unitCost: "", costMode: "EXPLICIT" }),
                }));
              },
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              {input("quantity", "Quantity", { decimal: true })}
              {input("unitPrice", "Unit price", { decimal: true })}
            </div>
            {select("costMode", "Cost source", [
              {
                value: "EXPLICIT",
                label: record
                  ? "Keep or edit the recorded cost"
                  : "Enter a cost or leave unknown",
              },
              ...(value("productServiceId")
                ? [{ value: "CATALOG", label: "Use current catalog cost" }]
                : []),
            ])}
            {value("costMode") === "EXPLICIT" ? (
              input("unitCost", "Unit cost (optional)", {
                decimal: true,
                required: false,
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                Current catalog cost:{" "}
                {options.products.find(
                  (product) => product.id === value("productServiceId"),
                )?.costPrice ?? "Unknown"}
                . The current value is recorded when you save.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Blank cost means unknown; zero means a known zero cost. One entry
              represents one complete transaction.
            </p>
            <div className="rounded-xl bg-accent p-4 text-sm">
              Calculated total{" "}
              <output
                aria-label="Calculated total"
                className="float-right font-semibold tabular-nums"
              >
                {business.currency} {total}
              </output>
            </div>
            {textarea("note", "Note (optional)", 1000)}
          </>
        )}
        {resource === "expenses" && (
          <>
            {input("expenseDate", "Expense date", { type: "date" })}
            {select("categoryId", "Expense category", [
              { value: "", label: "Choose a category" },
              ...options.categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ])}
            <p className="text-xs leading-6 text-muted-foreground">
              {record && value("categoryId") === record.categoryId
                ? `Recorded classification: ${classificationLabel(record.classification ?? null)}.`
                : `Classification: ${classificationLabel(options.categories.find((category) => category.id === value("categoryId"))?.classification ?? null)}.`}{" "}
              Changing the category records its current classification.
            </p>
            {input("amount", "Amount", { decimal: true })}
            {textarea("description", "Description (optional)", 1000)}
          </>
        )}
        {resource === "customer-metrics" && (
          <>
            {input("metricDate", "Count date", { type: "date" })}
            {input("customerCount", "Customer visits", {
              decimal: true,
              maxLength: 10,
            })}
            <p className="text-xs leading-6 text-muted-foreground">
              Enter a whole number, including 0 for a known zero-visit day.
              Repeat visits count again. This is not a count of unique people
              across dates.
            </p>
          </>
        )}
        {resource === "feedback" && (
          <>
            {input("feedbackDate", "Feedback date", { type: "date" })}
            {textarea("feedbackText", "Customer feedback", 2000, true)}
            <p className="text-xs leading-6 text-muted-foreground">
              Avoid names, phone numbers, and other personal details. Feedback
              is saved as pending analysis.
            </p>
          </>
        )}
      </fieldset>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-600/30 p-3 text-sm text-red-700 dark:text-red-300"
        >
          <p>{error}</p>
          {conflict && (
            <button
              type="button"
              className="mt-2 underline"
              onClick={() => window.location.reload()}
            >
              Reload latest records
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
        <Dialog.Close asChild>
          <Button type="button" variant="outline" disabled={busy}>
            Cancel
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save record"}
        </Button>
      </div>
    </form>
  );
}
