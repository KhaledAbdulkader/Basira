import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Brand />
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        This page isn’t here.
      </h1>
      <p className="max-w-md text-sm leading-7 text-muted-foreground">
        The link may have changed, or this part of Basira may not be available
        yet.
      </p>
      <Button asChild>
        <Link href="/">Return to overview</Link>
      </Button>
    </main>
  );
}
