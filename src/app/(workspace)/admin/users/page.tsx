import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/server";
import { adminUsers } from "@/lib/admin/service";
import { adminUsersQuery } from "@/lib/admin/contracts";
import { getDatabase } from "@/lib/db/client";
import { StatusAction } from "@/components/admin/status-action";
import { AdminPagination } from "@/components/admin/pagination";
import { inputStyle } from "@/components/records/record-editor";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Manage users" };
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdminPage(),
    parsed = adminUsersQuery.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <section>
        <h2 className="text-xl font-semibold">Check your user filters</h2>
        <Link href="/admin/users" className="text-primary underline">
          Reset filters
        </Link>
      </section>
    );
  const data = await adminUsers(getDatabase(), actor.id, parsed.data);
  return (
    <section aria-labelledby="admin-users-title" className="space-y-5">
      <h2 id="admin-users-title" className="text-xl font-semibold">
        Manage users
      </h2>
      <form action="/admin/users" className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="admin-user-search" className="text-sm">
            Search users
          </label>
          <input
            id="admin-user-search"
            name="q"
            type="search"
            maxLength={120}
            key={data.q}
            defaultValue={data.q}
            placeholder="Name or email"
            className={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="admin-user-status" className="text-sm">
            Account status
          </label>
          <select
            id="admin-user-status"
            name="status"
            defaultValue={data.status}
            key={data.status}
            className={inputStyle}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
        <div>
          <label htmlFor="admin-user-role" className="text-sm">
            Account role
          </label>
          <select
            id="admin-user-role"
            name="role"
            defaultValue={data.role}
            key={data.role}
            className={inputStyle}
          >
            <option value="ALL">All roles</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        <Link
          href="/admin/users"
          className="py-2 text-sm text-primary underline"
        >
          Reset filters
        </Link>
      </form>
      <div role="region" aria-label="User directory" className="space-y-3">
        {!data.items.length && (
          <p className="rounded-xl border bg-card p-6">
            No users match these filters.
          </p>
        )}
        {data.items.map((user) => (
          <article
            key={`${user.id}-${user.statusVersion}`}
            aria-label={user.email}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
          >
            <div className="min-w-0 space-y-2">
              <h3 className="break-words font-semibold">
                {user.name ?? "Unnamed account"}
              </h3>
              <p className="break-all text-sm">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                {user.role === "ADMIN" ? "Admin" : "User"} ·{" "}
                {user.status === "ACTIVE" ? "Active" : "Suspended"} ·{" "}
                {user.businessCount} businesses
              </p>
              <p className="text-xs text-muted-foreground">
                Joined {user.createdAt.slice(0, 10)} (UTC)
              </p>
            </div>
            <StatusAction user={user} isSelf={user.id === actor.id} />
          </article>
        ))}
      </div>
      <AdminPagination
        base="/admin/users"
        page={data.page}
        total={data.total}
        filters={{ q: data.q, status: data.status, role: data.role }}
      />
    </section>
  );
}
