import { businessToday, parseDate, dateOnly } from "@/lib/records/dates";
import { addDays, resolvePeriod } from "@/lib/dashboard/period";
import type { z } from "zod";
import type { createReportSchema } from "./contracts";

export function reportPeriod(
  request: z.infer<typeof createReportSchema>,
  timezone: string,
  now: Date,
) {
  const today = businessToday(timezone, now);
  let from: string, to: string;
  if (request.reportType === "WEEKLY") {
    const weekday = (parseDate(today).getUTCDay() + 6) % 7;
    to = addDays(today, -weekday - 1);
    from = addDays(to, -6);
  } else if (request.reportType === "MONTHLY") {
    to = addDays(`${today.slice(0, 7)}-01`, -1);
    from = `${to.slice(0, 7)}-01`;
  } else {
    from = request.from!;
    to = request.to!;
  }
  const period = resolvePeriod({ period: "custom", from, to }, timezone, now);
  // Report presets exclude incomplete periods; custom dates may include today with a warning.
  return {
    from: dateOnly(parseDate(period.current.from)),
    to: period.current.to,
  };
}
