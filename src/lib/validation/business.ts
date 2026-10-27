import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/business/constants";

const currencies = new Set(Intl.supportedValuesOf("currency"));
export const businessIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
const versionSchema = z.number().int().positive().max(2147483647);
const singleLine = (value: string) =>
  [...value].every(
    (character) =>
      character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
  );
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(singleLine, "Use a single line without control characters.")
    .nullable()
    .optional()
    .transform((value) => value || null);

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    // Named IANA zones and UTC only; reject numeric offsets accepted by some engines.
    if (value !== "UTC" && !value.includes("/")) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone.")
  .transform(
    (value) =>
      new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
        .timeZone,
  );

const fields = {
  name: z
    .string()
    .trim()
    .min(1, "Enter the business name.")
    .max(120, "Use at most 120 characters.")
    .refine(singleLine, "Use a single line for the business name."),
  businessType: z.enum(BUSINESS_TYPES.map((item) => item.value)),
  otherBusinessType: nullableText(120),
  location: nullableText(180),
  currency: z
    .string()
    .refine(
      (value) => currencies.has(value),
      "Choose a supported ISO currency code.",
    ),
  timezone: timezoneSchema,
};

function otherTypeRequired(value: {
  businessType: string;
  otherBusinessType: string | null;
}) {
  return value.businessType === "OTHER"
    ? Boolean(value.otherBusinessType)
    : value.otherBusinessType === null;
}
const otherMessage = {
  message: "Enter a custom type only when Other is selected.",
  path: ["otherBusinessType"],
};
export const createBusinessSchema = z
  .object(fields)
  .strict()
  .refine(otherTypeRequired, otherMessage);
export const updateBusinessSchema = z
  .object({ ...fields, version: versionSchema })
  .strict()
  .refine(otherTypeRequired, otherMessage);
export const deleteBusinessSchema = z
  .object({
    confirmationName: z.string().min(1).max(120),
    version: versionSchema,
  })
  .strict();
export const selectBusinessSchema = z
  .object({ businessId: businessIdSchema })
  .strict();
