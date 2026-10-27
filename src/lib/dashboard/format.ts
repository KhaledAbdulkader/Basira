import { Decimal, currencyPrecision } from "@/lib/records/money";

// Preserve decimal strings even above Number.MAX_SAFE_INTEGER. Numbers are used
// only for chart coordinates, never authoritative amounts or formatted totals.
export function formatMoney(value: string, currency: string) {
  const [whole = "0", fraction] = new Decimal(value)
    .toFixed(currencyPrecision(currency), Decimal.ROUND_HALF_UP)
    .split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
}
export function formatCount(value: number) {
  return new Intl.NumberFormat("en").format(value);
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
