import { z } from "zod";
import {
  productSchema,
  saleSchema,
  expenseSchema,
  customerMetricSchema,
  feedbackSchema,
} from "@/lib/validation/records";
import {
  calculateSaleTotal,
  Decimal,
  hasCurrencyPrecision,
} from "@/lib/records/money";
import {
  IMPORT_TYPES,
  type ImportType,
  type ParsedFile,
  type PreviewRow,
} from "./constants";

export const importTypeSchema = z.enum(IMPORT_TYPES);
export const importPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100000)
  .default(1);
export const normalizeName = (name: string) => name.trim().toLowerCase();
export type ImportContext = {
  currency: string;
  products: { id: string; name: string; active: boolean }[];
  categories: {
    id: string;
    name: string;
    classification: "OPERATING" | "INVENTORY_PURCHASE" | "OTHER";
  }[];
  customerDates: string[];
};

// Shared record schemas remain authoritative; this layer maps file headings and
// adds import-specific matching, duplicate and supplied-total rules.
export function validateImportRows(
  file: ParsedFile,
  type: ImportType,
  context: ImportContext,
): PreviewRow[] {
  const duplicates = new Map<string, number>();
  const rowFingerprint = new Map<string, number>();
  for (const row of file.rows) {
    const key =
      type === "PRODUCTS"
        ? normalizeName(row.values.item_name ?? "")
        : type === "CUSTOMER_METRICS"
          ? row.values.date
          : undefined;
    if (key) duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
  }
  return file.rows.map((row) => {
    const errors = [...row.errors];
    const warnings: string[] = [];
    const v = row.values;
    let resolved: PreviewRow["resolved"] = null;
    try {
      if (errors.length) return { ...row, errors, warnings, resolved };
      switch (type) {
        case "PRODUCTS": {
          const data = productSchema.parse({
            name: v.item_name,
            type: v.type?.toUpperCase(),
            category: v.category || null,
            costPrice: v.cost_price || null,
            sellingPrice: v.selling_price,
            active: true,
          });
          if ((duplicates.get(normalizeName(data.name)) ?? 0) > 1)
            errors.push(
              "item_name: this name occurs more than once in the file; keep one product row.",
            );
          if (
            context.products.some(
              (product) =>
                normalizeName(product.name) === normalizeName(data.name),
            )
          )
            errors.push(
              "item_name: already exists in this business. Edit the existing item normally.",
            );
          resolved = data;
          break;
        }
        case "SALES": {
          const matches = context.products.filter(
            (product) =>
              product.active &&
              normalizeName(product.name) === normalizeName(v.item_name ?? ""),
          );
          if (matches.length !== 1)
            errors.push(
              matches.length
                ? "item_name: matches multiple active items. Give the intended item a unique name first."
                : "item_name: no matching active product or service. Add or activate it first.",
            );
          const product = matches.length === 1 ? matches[0]! : null;
          const data = saleSchema.parse({
            saleDate: v.date,
            productServiceId: product?.id ?? null,
            quantity: v.quantity,
            unitPrice: v.unit_price,
            unitCost: v.unit_cost || null,
            costMode: "EXPLICIT",
            note: v.note || null,
          });
          const total = calculateSaleTotal(
            data.quantity,
            data.unitPrice,
            context.currency,
          );
          if (
            v.total_amount &&
            (!/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(v.total_amount) ||
              !new Decimal(v.total_amount).eq(total))
          )
            errors.push(
              "total_amount: must equal quantity × unit_price rounded to the business currency.",
            );
          if (data.unitCost === null)
            warnings.push(
              "Unit cost is unknown. This sale will lower cost-data coverage; current catalog cost is not substituted for a historical cost.",
            );
          resolved = {
            saleDate: data.saleDate,
            productServiceId: data.productServiceId,
            itemName: product?.name ?? null,
            quantity: data.quantity,
            unitPrice: data.unitPrice,
            unitCost: data.unitCost,
            totalAmount: total.toFixed(),
            note: data.note,
          };
          break;
        }
        case "EXPENSES": {
          const matches = context.categories.filter(
            (category) =>
              normalizeName(category.name) === normalizeName(v.category ?? ""),
          );
          if (matches.length !== 1) {
            errors.push(
              "category: choose an existing category in this business. Create and classify it first if needed.",
            );
            break;
          }
          const category = matches[0]!;
          const data = expenseSchema.parse({
            expenseDate: v.date,
            categoryId: category.id,
            amount: v.amount,
            description: v.description || null,
          });
          if (!hasCurrencyPrecision(data.amount, context.currency))
            errors.push(
              `amount: use the minor-unit precision of ${context.currency}.`,
            );
          resolved = {
            ...data,
            classification: category.classification,
            categoryName: category.name,
          };
          if (category.classification !== "OPERATING")
            warnings.push(
              `${category.classification === "OTHER" ? "Other spending" : "Inventory purchases"} is excluded from estimated profit and shown separately.`,
            );
          break;
        }
        case "CUSTOMER_METRICS": {
          if (!/^(0|[1-9]\d{0,9})$/.test(v.customer_count ?? ""))
            errors.push("customer_count: enter a nonnegative whole number.");
          const data = customerMetricSchema.parse({
            metricDate: v.date,
            customerCount: Number(v.customer_count),
          });
          if ((duplicates.get(data.metricDate) ?? 0) > 1)
            errors.push(
              "date: repeated in this file. Provide one total visit count per date.",
            );
          if (context.customerDates.includes(data.metricDate))
            errors.push(
              "date: a daily count already exists. Use the normal edit form to correct it.",
            );
          resolved = data;
          break;
        }
        case "FEEDBACK": {
          resolved = feedbackSchema.parse({
            feedbackDate: v.date,
            feedbackText: v.feedback_text,
          });
          break;
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError)
        errors.push(
          ...error.issues
            .slice(0, 5)
            .map(
              (issue) => `${issue.path.join(".") || "row"}: ${issue.message}`,
            ),
        );
      else errors.push("The calculated amount exceeds the supported range.");
    }
    if (!["PRODUCTS", "CUSTOMER_METRICS"].includes(type)) {
      const fingerprint = JSON.stringify(
        Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
      );
      const first = rowFingerprint.get(fingerprint);
      if (first)
        warnings.push(
          `Identical to row ${first}. Both rows will be imported as separate records if valid; remove unintended duplicates before confirming.`,
        );
      else rowFingerprint.set(fingerprint, row.row);
    }
    return {
      ...row,
      errors,
      warnings,
      resolved: errors.length ? null : resolved,
    };
  });
}
