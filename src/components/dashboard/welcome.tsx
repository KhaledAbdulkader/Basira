import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WelcomeOverview() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <section className="rounded-2xl border bg-card px-6 py-10 sm:px-10">
        <p className="mb-4 text-xs font-semibold tracking-widest text-primary uppercase">
          Welcome to Basira
        </p>
        <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          Business insight,
          <br />
          <span className="text-primary">made clear.</span>
        </h2>
        <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
          A thoughtful space to understand your business and decide what comes
          next. Bring sales, expenses, and customer visits into one clear
          picture.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/about">
            Explore Basira
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </Button>
      </section>
      <section className="flex flex-col items-center rounded-2xl border bg-card px-5 py-12 text-center">
        <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-accent text-primary">
          <Store size={28} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold">
          Your business story starts here
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Create a business profile to get started. You can manage multiple
          businesses, each with its own records and dashboard.
        </p>
        <Button asChild className="mt-5">
          <Link href="/businesses/new">Create your first business</Link>
        </Button>
      </section>
    </div>
  );
}
