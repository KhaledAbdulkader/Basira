import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { BusinessForm } from "@/components/business/business-form";
import { DeleteBusinessDialog } from "@/components/business/delete-business-dialog";
import { getBusinessForPage } from "@/lib/business/server";
import { getBusinessFormOptions } from "@/lib/business/options";

export const metadata: Metadata = { title: "Business settings" };

export default async function BusinessSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const business = await getBusinessForPage((await params).businessId);
  const saved = (await searchParams).saved === "1";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/businesses"
        className="inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All businesses
      </Link>
      <div>
        <p className="mb-2 break-words text-sm font-medium text-primary">
          {business.name}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Business settings
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Keep your business profile up to date.
        </p>
      </div>
      {saved && (
        <p
          role="status"
          className="rounded-xl border border-primary/20 bg-accent p-4 text-sm"
        >
          Business changes saved.
        </p>
      )}
      <section
        aria-label="Business details"
        className="rounded-2xl border border-border bg-card p-6 sm:p-8"
      >
        <BusinessForm
          business={business}
          options={getBusinessFormOptions(business.timezone)}
        />
      </section>
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Alert settings</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose which changes to monitor and set this business’s thresholds.
        </p>
        <Link
          href={`/businesses/${business.id}/alert-rules`}
          className="mt-3 inline-block text-sm text-primary underline"
        >
          Edit alert settings
        </Link>
      </section>
      <DeleteBusinessDialog business={business} />
    </div>
  );
}
