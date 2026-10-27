import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AlertIndicator } from "@/components/alerts/alert-indicator";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { CurrentUser } from "@/lib/auth/access";
import type { BusinessProfile } from "@/lib/business/constants";

export function AppShell({
  children,
  user,
  businesses,
  selectedBusiness,
  unreadAlerts = 0,
}: {
  children: ReactNode;
  user: CurrentUser;
  businesses: BusinessProfile[];
  selectedBusiness: BusinessProfile | null;
  unreadAlerts?: number;
}) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside
        aria-label="Workspace sidebar"
        className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-border lg:block"
      >
        <Sidebar
          businesses={businesses}
          selectedBusiness={selectedBusiness}
          isAdmin={user.role === "ADMIN"}
        />
      </aside>
      <div className="lg:pl-64">
        <header className="flex h-20 items-center justify-between gap-3 border-b border-border bg-card/70 px-4 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2 sm:gap-4">
            <MobileNavigation
              isAdmin={user.role === "ADMIN"}
              businesses={businesses}
              selectedBusiness={selectedBusiness}
            />
            <span className="text-sm font-medium">Workspace</span>
            <span aria-hidden="true" className="hidden text-border sm:block">
              /
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-amber-600 dark:bg-amber-400"
              />
              Preview
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-4">
            <span
              className="hidden max-w-32 truncate text-xs text-muted-foreground xl:block"
              title={user.email}
            >
              {user.name ?? user.email}
            </span>
            <Link
              href="/about"
              className="hidden items-center gap-1.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground sm:flex"
            >
              Meet Basira
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <ThemeToggle />
            {selectedBusiness && (
              <AlertIndicator
                key={selectedBusiness.id}
                businessId={selectedBusiness.id}
                unread={unreadAlerts}
              />
            )}
            <SignOutButton />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1440px] px-5 py-8 outline-none sm:px-8 lg:px-10 lg:py-10"
        >
          {children}
        </main>
        <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-5 pb-6 text-xs text-muted-foreground sm:px-8 lg:px-10">
          <span>Basira · Business insight, made clear.</span>
          <span>Built for small businesses.</span>
        </footer>
      </div>
    </div>
  );
}
