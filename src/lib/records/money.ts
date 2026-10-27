import { Prisma } from "@/generated/prisma/browser";

export const Decimal = Prisma.Decimal.clone({ precision: 40 });
export function currencyPrecision(currency: string) {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function calculateSaleTotal(
  quantity: string,
  unitPrice: string,
  currency: string,
) {
  const total = new Decimal(quantity)
    .times(unitPrice)
    .toDecimalPlaces(currencyPrecision(currency), Decimal.ROUND_HALF_UP);
  if (
    !total.isFinite() ||
    total.isNegative() ||
    total.gte("1000000000000000")
  ) {
    throw new Error("The calculated total exceeds the supported amount.");
  }
  return total;
}

export function hasCurrencyPrecision(value: string, currency: string) {
  return new Decimal(value).decimalPlaces() <= currencyPrecision(currency);
}
