import { z } from "zod";
import { businessIdSchema } from "@/lib/validation/business";

export const recordIdSchema = businessIdSchema;
export const recordVersionSchema = z.number().int().positive().max(2147483647);
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Enter a value.")
    .max(max)
    .refine(
      (value) =>
        [...value].every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      "Use a single line without control characters.",
    );
const optionalLine = (max: number) =>
  z
    .union([line(max), z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null);
const optionalText = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => !value.includes("\u0000"), "Remove null characters.")
  .nullable()
  .optional()
  .transform((value) => value || null);
// Strings only: reject exponents, separators, negative values, and silent rounding.
export const moneySchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,11})(\.\d{1,4})?$/,
    "Enter a nonnegative amount with up to 12 whole digits and 4 decimal places.",
  );
export const dateSchema = z
  .string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Enter a real calendar date.");
export const classificationSchema = z.enum([
  "OPERATING",
  "INVENTORY_PURCHASE",
  "OTHER",
]);
export const productSchema = z
  .object({
    name: line(120),
    type: z.enum(["PRODUCT", "SERVICE"]),
    category: optionalLine(80),
    costPrice: moneySchema.nullable(),
    sellingPrice: moneySchema,
    active: z.boolean(),
  })
  .strict();
export const categorySchema = z
  .object({ name: line(80), classification: classificationSchema })
  .strict();
export const saleSchema = z
  .object({
    saleDate: dateSchema,
    productServiceId: recordIdSchema.nullable(),
    quantity: z
      .string()
      .regex(
        /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/,
        "Use a positive quantity with up to 3 decimal places.",
      )
      .refine(
        (value) => Number(value) > 0,
        "Quantity must be greater than zero.",
      ),
    unitPrice: moneySchema,
    unitCost: moneySchema.nullable(),
    costMode: z.enum(["CATALOG", "EXPLICIT"]),
    note: optionalText,
  })
  .strict()
  .refine(
    (data) => data.costMode !== "CATALOG" || data.productServiceId !== null,
    "Select a product to use its current cost.",
  )
  .refine(
    (data) => data.costMode !== "CATALOG" || data.unitCost === null,
    "Choose an explicit cost or current catalog cost, not both.",
  );
export const expenseSchema = z
  .object({
    expenseDate: dateSchema,
    categoryId: recordIdSchema,
    amount: moneySchema.refine(
      (value) => Number(value) > 0,
      "Expense amount must be greater than zero.",
    ),
    description: optionalText,
  })
  .strict();
export const customerMetricSchema = z
  .object({
    metricDate: dateSchema,
    customerCount: z
      .number({ error: "Enter a whole customer-visit count." })
      .int("Enter a whole customer-visit count.")
      .min(0, "Customer visits cannot be negative.")
      .max(2147483647),
  })
  .strict();
export const feedbackSchema = z
  .object({
    feedbackDate: dateSchema,
    feedbackText: z
      .string()
      .trim()
      .min(1, "Enter customer feedback.")
      .max(2000)
      .refine((value) => !value.includes("\u0000"), "Remove null characters."),
  })
  .strict();
export const deleteRecordSchema = z
  .object({ version: recordVersionSchema, confirmed: z.literal(true) })
  .strict();
export { optionalText };
export const recordQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    order: z.enum(["asc", "desc"]).default("desc"),
    sort: z.enum(["date", "name", "amount"]).default("date"),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    search: z.string().trim().max(120).default(""),
    productId: recordIdSchema.optional(),
    categoryId: recordIdSchema.optional(),
    category: z.string().trim().max(80).optional(),
    active: z.enum(["all", "true", "false"]).default("all"),
  })
  .strict()
  .refine(
    (data) => !data.from || !data.to || data.from <= data.to,
    "Start date must not be after end date.",
  );
export type RecordQuery = z.infer<typeof recordQuerySchema>;
