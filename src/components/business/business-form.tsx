"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUSINESS_TYPES, type BusinessProfile } from "@/lib/business/constants";
import type { BusinessFormOptions } from "@/lib/business/options";

const fieldClass =
  "h-12 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function BusinessForm({
  business,
  options,
}: {
  business?: BusinessProfile;
  options: BusinessFormOptions;
}) {
  const [type, setType] = useState(business?.businessType ?? "RETAIL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const timezoneRef = useRef<HTMLSelectElement>(null);
  const locked = Boolean(business?.financialSettingsLockedAt);

  useEffect(() => {
    if (business || !timezoneRef.current) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && options.timezones.includes(zone))
      timezoneRef.current.value = zone;
  }, [business, options.timezones]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStale(false);
    const form = new FormData(event.currentTarget);
    const data = {
      name: form.get("name"),
      businessType: type,
      otherBusinessType:
        type === "OTHER" ? form.get("otherBusinessType") : null,
      location: form.get("location"),
      currency: locked ? business!.currency : form.get("currency"),
      timezone: locked ? business!.timezone : form.get("timezone"),
      ...(business ? { version: business.version } : {}),
    };
    try {
      const response = await fetch(
        business ? `/api/v1/businesses/${business.id}` : "/api/v1/businesses",
        {
          method: business ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const result: { message?: string } = await response.json();
      if (!response.ok) {
        setError(result.message ?? "Please try again.");
        setStale(response.status === 409);
        setBusy(false);
        return;
      }
      window.location.assign(
        business ? `/businesses/${business.id}?saved=1` : "/",
      );
    } catch {
      setError(
        "We couldn’t connect. Your changes have not been confirmed. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={busy}>
      <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
        <legend className="sr-only">Business profile</legend>
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="business-name" className="text-sm font-medium">
            Business name
          </label>
          <input
            className={fieldClass}
            id="business-name"
            name="name"
            required
            maxLength={120}
            defaultValue={business?.name}
            autoComplete="organization"
            placeholder="e.g. Olive & Oak Cafe"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="business-type" className="text-sm font-medium">
            Business type
          </label>
          <select
            id="business-type"
            name="businessType"
            className={fieldClass}
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
          >
            {BUSINESS_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        {type === "OTHER" && (
          <div className="space-y-2">
            <label htmlFor="other-type" className="text-sm font-medium">
              Describe your business type
            </label>
            <input
              id="other-type"
              name="otherBusinessType"
              className={fieldClass}
              required
              maxLength={120}
              defaultValue={business?.otherBusinessType ?? ""}
            />
          </div>
        )}
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="business-location" className="text-sm font-medium">
            Location{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <input
            className={fieldClass}
            id="business-location"
            name="location"
            maxLength={180}
            defaultValue={business?.location ?? ""}
            placeholder="e.g. Riyadh, Saudi Arabia"
          />
        </div>
        <div className="min-w-0 space-y-2">
          <label htmlFor="business-currency" className="text-sm font-medium">
            Currency
          </label>
          <select
            className={fieldClass}
            id="business-currency"
            name="currency"
            disabled={locked}
            required
            defaultValue={business?.currency ?? ""}
            aria-describedby="financial-settings-note"
          >
            <option value="" disabled>
              Choose a currency
            </option>
            {options.currencies.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 space-y-2">
          <label htmlFor="business-timezone" className="text-sm font-medium">
            Timezone
          </label>
          <select
            ref={timezoneRef}
            className={fieldClass}
            id="business-timezone"
            name="timezone"
            disabled={locked}
            required
            defaultValue={business?.timezone ?? "UTC"}
            aria-describedby="timezone-note financial-settings-note"
          >
            {options.timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <p
            id="timezone-note"
            className="text-xs leading-5 text-muted-foreground"
          >
            {business
              ? "Sets the calendar used for business reporting."
              : "Suggested from your browser when available. You can change it."}
          </p>
        </div>
      </fieldset>
      <div
        id="financial-settings-note"
        className="flex items-start gap-3 rounded-xl bg-accent/65 p-4 text-sm leading-6 text-muted-foreground"
      >
        <LockKeyhole
          className="mt-1 size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p>
          {locked
            ? "Currency and timezone are locked because financial records have been added. You can still update the other profile details."
            : "Choose your currency and timezone carefully. Both will be locked once financial records are added to preserve your business history."}
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-600/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"
        >
          <p>{error}</p>
          {stale && (
            <button
              type="button"
              className="mt-2 font-semibold underline"
              onClick={() => window.location.reload()}
            >
              Reload latest details
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <ArrowRight aria-hidden="true" />
          )}
          {busy ? "Saving…" : business ? "Save changes" : "Create business"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/businesses">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
