import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { businessTypeLabel } from "@/lib/business/constants";
import { SelectBusinessButton } from "@/components/business/select-business-button";

export const metadata: Metadata = { title: "Businesses" };

export default async function BusinessesPage() {
  const { businesses, selectedBusiness } = await getWorkspaceBusinesses();
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Your workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your businesses
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Give each business its own space, settings, and story.
          </p>
        </div>
        <Button asChild>
          <Link href="/businesses/new">
            <Plus aria-hidden="true" />
            Add business
          </Link>
        </Button>
      </div>
      {!businesses.length ? (
        <section className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <Store
            className="mx-auto mb-5 size-10 text-primary"
            aria-hidden="true"
          />
          <h2 className="text-xl font-semibold">
            A home for your first business
          </h2>
          <p className="mx-auto mt-3 mb-6 max-w-md text-sm leading-7 text-muted-foreground">
            Start with a name and a few details. You can add more businesses
            whenever you need to.
          </p>
          <Button asChild>
            <Link href="/businesses/new">Create your first business</Link>
          </Button>
        </section>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {businesses.map((business) => (
            <article
              key={business.id}
              aria-labelledby={`business-${business.id}`}
              className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-6"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                  <Store className="size-5" aria-hidden="true" />
                </span>
                {selectedBusiness?.id === business.id && (
                  <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                    Active
                  </span>
                )}
              </div>
              <h2
                id={`business-${business.id}`}
                className="break-words text-lg font-semibold"
              >
                {business.name}
              </h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {businessTypeLabel(
                  business.businessType,
                  business.otherBusinessType,
                )}
              </p>
              <p className="mt-5 flex items-start gap-2 break-words text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {business.location ?? "Location not set"}
              </p>
              <p className="mt-2 text-xs leading-6 break-words text-muted-foreground">
                {business.currency} · {business.timezone.replaceAll("_", " ")}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                <SelectBusinessButton
                  id={business.id}
                  selected={selectedBusiness?.id === business.id}
                />
                <Link
                  href={`/businesses/${business.id}`}
                  className="rounded text-sm font-medium text-primary hover:underline"
                >
                  Manage settings
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs leading-6 text-muted-foreground">
        Only businesses owned by your account appear here.
      </p>
    </div>
  );
}
