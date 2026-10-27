import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "@/lib/auth/access";
import { RequestError } from "@/lib/http/request";
import {
  adminUsersQuery,
  adminBusinessesQuery,
  adminUserId,
  userStatusMutation,
  literalSearch,
  type AdminUserView,
} from "./contracts";

type Database = PrismaClient | Prisma.TransactionClient;
export async function requireAdminActor(db: Database, actorId: string) {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (!actor) throw new AccessError(401);
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE")
    throw new AccessError(403);
}
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  statusVersion: true,
  createdAt: true,
  _count: { select: { businesses: true } },
} as const;
function userView(
  user: Prisma.UserGetPayload<{ select: typeof userSelect }>,
): AdminUserView {
  const { _count, createdAt, ...rest } = user;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    businessCount: _count.businesses,
  };
}
export async function adminStatistics(db: PrismaClient, actorId: string) {
  return db.$transaction(
    async (tx) => {
      await requireAdminActor(tx, actorId);
      const [groups, totalBusinesses] = await Promise.all([
        tx.user.groupBy({ by: ["status"], _count: { _all: true } }),
        tx.business.count(),
      ]);
      const activeUsers =
        groups.find((g) => g.status === "ACTIVE")?._count._all ?? 0;
      const suspendedUsers =
        groups.find((g) => g.status === "SUSPENDED")?._count._all ?? 0;
      return {
        totalUsers: activeUsers + suspendedUsers,
        activeUsers,
        suspendedUsers,
        totalBusinesses,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function adminUsers(
  db: PrismaClient,
  actorId: string,
  input: unknown = {},
) {
  return db.$transaction(
    async (tx) => {
      await requireAdminActor(tx, actorId);
      const query = adminUsersQuery.parse(input),
        search = literalSearch(query.q);
      const where: Prisma.UserWhereInput = {
        ...(query.status === "ALL" ? {} : { status: query.status }),
        ...(query.role === "ALL" ? {} : { role: query.role }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.user.findMany({
          where,
          select: userSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * 20,
          take: 20,
        }),
        tx.user.count({ where }),
      ]);
      return { items: rows.map(userView), total, pageSize: 20, ...query };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function adminBusinesses(
  db: PrismaClient,
  actorId: string,
  input: unknown = {},
) {
  return db.$transaction(
    async (tx) => {
      await requireAdminActor(tx, actorId);
      const query = adminBusinessesQuery.parse(input),
        search = literalSearch(query.q);
      const where: Prisma.BusinessWhereInput = {
        ...(query.type === "ALL" ? {} : { businessType: query.type }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { owner: { email: { contains: search, mode: "insensitive" } } },
                { owner: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        tx.business.findMany({
          where,
          select: {
            id: true,
            name: true,
            businessType: true,
            createdAt: true,
            owner: {
              select: { id: true, name: true, email: true, status: true },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * 20,
          take: 20,
        }),
        tx.business.count({ where }),
      ]);
      return {
        items: items.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
        })),
        total,
        pageSize: 20,
        ...query,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function changeUserStatus(
  db: PrismaClient,
  actorId: string,
  targetId: string,
  input: unknown,
) {
  const id = adminUserId.parse(targetId),
    data = userStatusMutation.parse(input);
  return db.$transaction(
    async (tx) => {
      // Lock both in a stable order: simultaneous admins cannot suspend one another
      // using authorization read before the competing status change committed.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}, ${id}) ORDER BY "id" FOR UPDATE`;
      await requireAdminActor(tx, actorId);
      if (actorId === id)
        throw new RequestError(
          409,
          "You cannot change your own account status. Another active administrator must do this.",
        );
      const current = await tx.user.findUnique({
        where: { id },
        select: userSelect,
      });
      if (!current) throw new RequestError(404, "User not found.");
      if (current.statusVersion !== data.version)
        throw new RequestError(
          409,
          "This account status changed. Reload the latest details before confirming.",
        );
      if (current.status === data.status)
        return { user: userView(current), changed: false };
      // The database trigger advances statusVersion, including ordinary SQL writes.
      const updated = await tx.user.update({
        where: { id },
        data: { status: data.status },
        select: userSelect,
      });
      return { user: userView(updated), changed: true };
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
