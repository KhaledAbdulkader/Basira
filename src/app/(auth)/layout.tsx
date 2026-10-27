import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-5 pb-12 lg:min-h-[75dvh] lg:grid-cols-2 lg:gap-24 lg:px-10">
        <section className="hidden lg:block">
          <span className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            A clearer view of your business
          </span>
          <h2 className="mt-6 max-w-md text-5xl leading-[1.15] font-semibold tracking-[-1.8px]">
            Business insight,
            <br />
            <span className="text-primary">made clear.</span>
          </h2>
          <p className="mt-6 max-w-sm text-base leading-8 text-muted-foreground">
            A thoughtful space to understand your business and decide what comes
            next.
          </p>
          <div className="mt-10 max-w-sm rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 h-1 w-10 rounded-full bg-primary" />
            <p className="text-sm leading-7">
              Small steps. Better understanding.
              <br />
              <span className="text-muted-foreground">
                Start with a space that’s yours.
              </span>
            </p>
          </div>
        </section>
        <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[0_12px_48px_-32px_rgba(20,45,59,0.3)] sm:p-9">
          {children}
        </div>
      </main>
      <footer className="px-6 pb-6 text-center text-xs leading-6 text-muted-foreground">
        Basira · Built for small businesses.
      </footer>
    </div>
  );
}
