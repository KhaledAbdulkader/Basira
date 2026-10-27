export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
export function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
export function businessToday(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
