"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
export function AlertIndicator({
  businessId,
  unread,
}: {
  businessId: string;
  unread: number;
}) {
  const pathname = usePathname(),
    [current, setCurrent] = useState({ businessId, count: unread });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/v1/businesses/${businessId}/alerts/summary`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (
          !controller.signal.aborted &&
          Number.isInteger(result.unread) &&
          result.unread >= 0
        )
          setCurrent({ businessId, count: result.unread });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [businessId, pathname, unread]);
  const count = current.businessId === businessId ? current.count : unread;
  return (
    <Link
      href="/alerts"
      aria-label={`Alerts, ${count} unread`}
      className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:text-foreground"
    >
      <Bell size={18} aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] text-primary-foreground"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
