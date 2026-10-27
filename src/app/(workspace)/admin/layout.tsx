import Link from "next/link";
import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/auth/server";
import AdminNotFound from "./not-found";
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageUser();
  if (user.role !== "ADMIN") return <AdminNotFound />;
  return (
    <div className="min-w-0 space-y-7">
      <header>
        <p className="text-sm font-medium text-primary">
          Basira administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Administration</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          Manage account access and review basic platform information. Business
          records remain private to their owners.
        </p>
      </header>
      <nav
        aria-label="Administration navigation"
        className="flex flex-wrap gap-3 text-sm"
      >
        <Link
          href="/admin"
          className="rounded-lg border bg-card px-4 py-2 hover:bg-accent"
        >
          Statistics
        </Link>
        <Link
          href="/admin/users"
          className="rounded-lg border bg-card px-4 py-2 hover:bg-accent"
        >
          Users
        </Link>
        <Link
          href="/admin/businesses"
          className="rounded-lg border bg-card px-4 py-2 hover:bg-accent"
        >
          Business directory
        </Link>
      </nav>
      {children}
    </div>
  );
}
