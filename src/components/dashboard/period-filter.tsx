"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DashboardPeriod } from "@/lib/dashboard/period";

const inputClass =
  "mt-1.5 h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary";
export function PeriodFilter({ period }: { period: DashboardPeriod }) {
  const [preset, setPreset] = useState(period.preset);
  return (
    <form
      action="/"
      method="get"
      aria-label="Dashboard period"
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
    >
      <label className="min-w-40 flex-1 text-xs font-medium">
        Period
        <select
          className={inputClass}
          name="period"
          value={preset}
          onChange={(event) =>
            setPreset(event.target.value as DashboardPeriod["preset"])
          }
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="custom">Custom period</option>
        </select>
      </label>
      {preset === "custom" && (
        <>
          <label className="min-w-36 flex-1 text-xs font-medium">
            Start date
            <input
              className={inputClass}
              type="date"
              name="from"
              defaultValue={period.current.from}
              max={period.today}
              required
            />
          </label>
          <label className="min-w-36 flex-1 text-xs font-medium">
            End date
            <input
              className={inputClass}
              type="date"
              name="to"
              defaultValue={period.current.to}
              max={period.today}
              required
            />
          </label>
        </>
      )}
      <Button type="submit">Apply period</Button>
    </form>
  );
}
