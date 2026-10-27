"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Store } from "lucide-react";
import type { BusinessProfile } from "@/lib/business/constants";

export async function selectBusiness(id: string) {
  const response = await fetch("/api/v1/businesses/selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessId: id }),
  });
  if (!response.ok)
    throw new Error("Unable to switch businesses. Refresh and try again.");
  // Discard all client route state when changing business context.
  window.location.assign("/");
}

export function BusinessSwitcher({
  businesses,
  selectedBusiness,
  onNavigate,
}: {
  businesses: BusinessProfile[];
  selectedBusiness: BusinessProfile | null;
  onNavigate?: () => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mb-6 rounded-xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Store className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <label
          htmlFor={id}
          className="text-xs font-medium text-muted-foreground"
        >
          Active business
        </label>
      </div>
      {selectedBusiness ? (
        <select
          id={id}
          className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm font-medium"
          value={selectedBusiness.id}
          disabled={busy}
          onChange={async (event) => {
            setBusy(true);
            setError("");
            try {
              await selectBusiness(event.target.value);
            } catch {
              setError("Unable to switch. Refresh and try again.");
              setBusy(false);
            }
          }}
        >
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="py-1 text-sm">No business yet</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <Link
        href="/businesses"
        onClick={onNavigate}
        className="mt-3 block rounded text-xs font-medium text-primary hover:underline"
      >
        Manage businesses
      </Link>
    </div>
  );
}
