import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { BusinessForm } from "@/components/business/business-form";
import { getBusinessFormOptions } from "@/lib/business/options";
import { requirePageUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Create a business" };

export default async function NewBusinessPage() {
  await requirePageUser();
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
        <h1 className="text-3xl font-semibold tracking-tight">
          Create a business
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Tell Basira a little about your business. Each business has its own
          settings.
        </p>
      </div>
      <section
        aria-label="Business details"
        className="rounded-2xl border border-border bg-card p-6 sm:p-8"
      >
        <BusinessForm options={getBusinessFormOptions()} />
      </section>
    </div>
  );
}
