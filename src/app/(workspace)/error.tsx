"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-border bg-card p-8">
      <h1 className="text-xl font-semibold">We couldn’t load this page.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Please try again. If the problem continues, come back in a little while.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
