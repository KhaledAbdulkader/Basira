import { z } from "zod";
import { dateSchema } from "@/lib/validation/records";
import { businessToday, parseDate, dateOnly } from "@/lib/records/dates";

export const dashboardQuerySchema = z
  .object({
    period: z.enum(["7d", "30d", "90d", "custom"]).default("30d"),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.period === "custom" && (!data.from || !data.to))
      ctx.addIssue({
        code: "custom",
        message: "Choose both dates for a custom period.",
      });
    if (data.period !== "custom" && (data.from || data.to))
      ctx.addIssue({
        code: "custom",
        message: "Choose Custom period to use specific dates.",
      });
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DateRange = { from: string; to: string; days: number };
export type DashboardPeriod = {
  preset: DashboardQuery["period"];
  current: DateRange;
  previous: DateRange;
  today: string;
};

export function addDays(date: string, count: number) {
  const result = parseDate(date);
  result.setUTCDate(result.getUTCDate() + count);
  return dateOnly(result);
}
export function resolvePeriod(
  input: unknown,
  timezone: string,
  now = new Date(),
): DashboardPeriod {
  const query = dashboardQuerySchema.parse(input);
  const today = businessToday(timezone, now);
  const to = query.period === "custom" ? query.to! : today;
  const from =
    query.period === "custom"
      ? query.from!
      : addDays(to, -(Number.parseInt(query.period) - 1));
  const days =
    Math.round(
      (parseDate(to).getTime() - parseDate(from).getTime()) / 86400000,
    ) + 1;
  let message: string | undefined;
  if (days < 1) message = "The start date must be on or before the end date.";
  else if (days > 366) message = "Choose a period of 366 days or fewer.";
  else if (to > today)
    message =
      "Choose an end date on or before today in your business timezone.";
  else if (addDays(from, -days) < "1000-01-01")
    message = "Choose a later start date so a preceding period is available.";
  if (message)
    throw new z.ZodError([{ code: "custom", path: ["from"], message }]);
  return {
    preset: query.period,
    current: { from, to, days },
    previous: { from: addDays(from, -days), to: addDays(from, -1), days },
    today,
  };
}
