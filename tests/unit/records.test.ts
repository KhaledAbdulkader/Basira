import { expect, test } from "vitest";
import { calculateSaleTotal, hasCurrencyPrecision } from "@/lib/records/money";
import { businessToday, dateOnly, parseDate } from "@/lib/records/dates";
import {
  dateSchema,
  moneySchema,
  productSchema,
  saleSchema,
  customerMetricSchema,
  recordQuerySchema,
  feedbackSchema,
} from "@/lib/validation/records";

test("money inputs preserve exact decimal strings and reject implicit rounding/coercion", () => {
  for (const value of ["0", "0.0001", "999999999999.9999", "12.3400"])
    expect(moneySchema.parse(value)).toBe(value);
  for (const value of [
    12.34,
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    "1,000",
    "01",
    "1.00001",
    "1000000000000",
  ])
    expect(moneySchema.safeParse(value).success).toBe(false);
});
test("sale arithmetic is exact, rounds once half-up, and respects currency minor units", () => {
  expect(calculateSaleTotal("3", "0.1", "SAR").toFixed(2)).toBe("0.30");
  expect(calculateSaleTotal("1.005", "1", "SAR").toFixed(2)).toBe("1.01");
  expect(calculateSaleTotal("1", "1.2345", "JOD").toFixed(3)).toBe("1.235");
  expect(calculateSaleTotal("1", "10.5", "JPY").toFixed(0)).toBe("11");
  expect(
    calculateSaleTotal("1.001", "999999999999.9999", "SAR").toFixed(2),
  ).toBe("1001000000000.00");
  expect(() =>
    calculateSaleTotal("999999999", "999999999999", "SAR"),
  ).toThrow();
  expect(hasCurrencyPrecision("1.001", "SAR")).toBe(false);
  expect(hasCurrencyPrecision("1.2300", "SAR")).toBe(true);
  expect(hasCurrencyPrecision("1.001", "JOD")).toBe(true);
});
test("unknown and known-zero costs remain distinct", () => {
  const item = {
    name: "Service",
    type: "SERVICE",
    active: true,
    sellingPrice: "0",
    costPrice: null,
  };
  expect(productSchema.parse(item).costPrice).toBeNull();
  expect(productSchema.parse({ ...item, costPrice: "0" }).costPrice).toBe("0");
  expect(productSchema.safeParse({ ...item, ownerId: "forged" }).success).toBe(
    false,
  );
  expect(productSchema.safeParse({ ...item, sellingPrice: "-1" }).success).toBe(
    false,
  );
});
test("calendar dates reject rollover and preserve business-local dates across offsets and DST", () => {
  for (const date of ["2024-02-29", "2026-09-20", "9999-12-31"])
    expect(dateOnly(parseDate(dateSchema.parse(date)))).toBe(date);
  for (const date of [
    "2025-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-1-01",
    "2026-09-20T00:00:00Z",
  ])
    expect(dateSchema.safeParse(date).success).toBe(false);
  expect(businessToday("Asia/Riyadh", new Date("2026-09-20T21:30:00Z"))).toBe(
    "2026-09-21",
  );
  expect(
    businessToday("America/New_York", new Date("2026-03-08T04:30:00Z")),
  ).toBe("2026-03-07");
});
test("sales, counts, feedback, and list filters reject invalid or privileged fields", () => {
  const sale = {
    saleDate: "2026-09-20",
    productServiceId: null,
    quantity: "0.125",
    unitPrice: "12",
    unitCost: null,
    costMode: "EXPLICIT",
  };
  expect(saleSchema.safeParse(sale).success).toBe(true);
  expect(
    saleSchema.safeParse({
      ...sale,
      productServiceId: "product",
      costMode: "CATALOG",
      unitCost: "3",
    }).success,
  ).toBe(false);
  for (const change of [
    { quantity: "0" },
    { quantity: "-1" },
    { quantity: "1.0001" },
    { costMode: "CATALOG" },
    { totalAmount: "999" },
    { source: "IMPORT" },
  ])
    expect(saleSchema.safeParse({ ...sale, ...change }).success).toBe(false);
  expect(
    customerMetricSchema.safeParse({
      metricDate: sale.saleDate,
      customerCount: 0,
    }).success,
  ).toBe(true);
  expect(
    customerMetricSchema.safeParse({
      metricDate: sale.saleDate,
      customerCount: 0.5,
    }).success,
  ).toBe(false);
  expect(
    feedbackSchema.safeParse({
      feedbackDate: sale.saleDate,
      feedbackText: "Good",
      sentiment: "POSITIVE",
    }).success,
  ).toBe(false);
  expect(recordQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  expect(
    recordQuerySchema.safeParse({ from: "2026-10-01", to: "2026-09-01" })
      .success,
  ).toBe(false);
});
