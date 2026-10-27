import { randomUUID } from "node:crypto";
import { afterAll, afterEach, expect, test } from "vitest";
import { testDatabase as db } from "../helpers/database";
import {
  adminStatistics,
  adminUsers,
  adminBusinesses,
  changeUserStatus,
} from "@/lib/admin/service";
import { grantAdministrator } from "@/lib/admin/provisioning";
import { createBusiness, getOwnedBusiness } from "@/lib/business/service";
import { createAuthOptions } from "@/lib/auth/options";
import type { Session } from "next-auth";

const ids: string[] = [];
async function account(
  role: "ADMIN" | "USER" = "USER",
  status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
  name = "Admin test owner",
) {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@admin-test.example`,
      role,
      status,
      name,
      passwordHash: "PRIVATE_PASSWORD_HASH",
      image: "https://private.example/avatar",
    },
  });
  ids.push(user.id);
  return user;
}
const change = (version: number, status: "ACTIVE" | "SUSPENDED") => ({
  version,
  status,
  confirmed: true,
});
afterEach(async () => {
  await db.business.deleteMany({ where: { ownerId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
});
afterAll(async () => {
  await db.$disconnect();
});

test("statistics count active/suspended users and businesses without private business aggregates", async () => {
  const actor = await account("ADMIN"),
    baseline = await adminStatistics(db, actor.id);
  const owner = await account(),
    paused = await account("USER", "SUSPENDED");
  await createBusiness(db, owner.id, {
    name: "Metadata cafe",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "UTC",
  });
  const stats = await adminStatistics(db, actor.id);
  expect(stats).toEqual({
    totalUsers: baseline.totalUsers + 2,
    activeUsers: baseline.activeUsers + 1,
    suspendedUsers: baseline.suspendedUsers + 1,
    totalBusinesses: baseline.totalBusinesses + 1,
  });
  expect(paused.status).toBe("SUSPENDED");
});
test("every service rejects ordinary, suspended, demoted and nonexistent actors independently", async () => {
  const actor = await account("ADMIN"),
    ordinary = await account(),
    suspended = await account("ADMIN", "SUSPENDED"),
    target = await account();
  for (const [id, status] of [
    [ordinary.id, 403],
    [suspended.id, 403],
    ["missing-actor", 401],
  ] as const) {
    for (const operation of [
      () => adminStatistics(db, id),
      () => adminUsers(db, id),
      () => adminBusinesses(db, id),
      () => changeUserStatus(db, id, target.id, change(1, "SUSPENDED")),
    ])
      await expect(operation()).rejects.toMatchObject({ status });
  }
  await db.user.update({ where: { id: actor.id }, data: { role: "USER" } });
  await expect(adminStatistics(db, actor.id)).rejects.toMatchObject({
    status: 403,
  });
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: target.id } })).status,
  ).toBe("ACTIVE");
});
test("user search, status/role filters and pagination expose only allowlisted metadata", async () => {
  const actor = await account("ADMIN"),
    marker = randomUUID();
  for (let i = 0; i < 22; i++)
    await account(
      i === 21 ? "ADMIN" : "USER",
      i === 0 ? "SUSPENDED" : "ACTIVE",
      `${marker} person ${i}`,
    );
  const first = await adminUsers(db, actor.id, { q: marker.toUpperCase() }),
    second = await adminUsers(db, actor.id, { q: marker, page: 2 });
  expect(first.total).toBe(22);
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(2);
  expect(new Set([...first.items, ...second.items].map((u) => u.id)).size).toBe(
    22,
  );
  expect(Object.keys(first.items[0]!).sort()).toEqual(
    [
      "id",
      "name",
      "email",
      "role",
      "status",
      "statusVersion",
      "createdAt",
      "businessCount",
    ].sort(),
  );
  expect(JSON.stringify(first)).not.toMatch(
    /PRIVATE_PASSWORD_HASH|private\.example|passwordHash|accounts|sessions/,
  );
  expect(
    (await adminUsers(db, actor.id, { q: marker, status: "SUSPENDED" })).total,
  ).toBe(1);
  expect(
    (await adminUsers(db, actor.id, { q: marker, role: "ADMIN" })).total,
  ).toBe(1);
  expect(
    (await adminUsers(db, actor.id, { q: marker, page: 3 })).items,
  ).toEqual([]);
});
test("search treats percent, underscore and backslash literally", async () => {
  const actor = await account("ADMIN"),
    marker = randomUUID();
  const literal = await account("USER", "ACTIVE", `${marker} 50%_cafe\\name`);
  await account("USER", "ACTIVE", `${marker} 500xcafeXname`);
  expect(
    (
      await adminUsers(db, actor.id, { q: `${marker} 50%_cafe\\name` })
    ).items.map((u) => u.id),
  ).toEqual([literal.id]);
});
test("business directory is limited metadata and never grants financial-content ownership", async () => {
  const actor = await account("ADMIN"),
    owner = await account(),
    marker = randomUUID();
  const business = await createBusiness(db, owner.id, {
    name: `${marker} Cafe`,
    businessType: "CAFE",
    location: "PRIVATE_LOCATION",
    currency: "SAR",
    timezone: "UTC",
  });
  await createBusiness(db, owner.id, {
    name: `${marker} Retail`,
    businessType: "RETAIL",
    currency: "SAR",
    timezone: "UTC",
  });
  const directory = await adminBusinesses(db, actor.id, {
    q: marker,
    type: "CAFE",
  });
  expect(directory.total).toBe(1);
  expect(Object.keys(directory.items[0]!).sort()).toEqual(
    ["id", "name", "businessType", "createdAt", "owner"].sort(),
  );
  expect(Object.keys(directory.items[0]!.owner).sort()).toEqual(
    ["id", "name", "email", "status"].sort(),
  );
  expect(JSON.stringify(directory)).not.toMatch(
    /PRIVATE_LOCATION|passwordHash|sales|revenue|feedback|snapshot|currency|timezone/,
  );
  expect(
    (await adminBusinesses(db, actor.id, { q: owner.email.toUpperCase() }))
      .total,
  ).toBe(2);
  await expect(
    getOwnedBusiness(db, actor.id, business.id),
  ).rejects.toMatchObject({ status: 404 });
  await changeUserStatus(db, actor.id, owner.id, change(1, "SUSPENDED"));
  expect(
    (await adminBusinesses(db, actor.id, { q: marker })).items.every(
      (b) => b.owner.status === "SUSPENDED",
    ),
  ).toBe(true);
});
test("status updates retain records, advance versions and support same-state no-ops", async () => {
  const actor = await account("ADMIN"),
    owner = await account();
  const b = await createBusiness(db, owner.id, {
    name: "Retained cafe",
    businessType: "CAFE",
    currency: "SAR",
    timezone: "UTC",
  });
  const unchanged = await changeUserStatus(
    db,
    actor.id,
    owner.id,
    change(1, "ACTIVE"),
  );
  expect(unchanged.changed).toBe(false);
  expect(unchanged.user.statusVersion).toBe(1);
  const paused = await changeUserStatus(
    db,
    actor.id,
    owner.id,
    change(1, "SUSPENDED"),
  );
  expect(paused.user.statusVersion).toBe(2);
  expect(paused.user.status).toBe("SUSPENDED");
  expect(await db.business.findUnique({ where: { id: b.id } })).not.toBeNull();
  await expect(getOwnedBusiness(db, owner.id, b.id)).rejects.toMatchObject({
    status: 403,
  });
  const active = await changeUserStatus(
    db,
    actor.id,
    owner.id,
    change(2, "ACTIVE"),
  );
  expect(active.user.statusVersion).toBe(3);
  expect((await getOwnedBusiness(db, owner.id, b.id)).id).toBe(b.id);
  await expect(
    changeUserStatus(db, actor.id, owner.id, change(1, "SUSPENDED")),
  ).rejects.toMatchObject({ status: 409 });
});
test("suspension blocks existing sessions and activation restores an unexpired identity", async () => {
  const actor = await account("ADMIN"),
    owner = await account();
  const options = createAuthOptions(db, { secret: randomUUID() }),
    session = options.callbacks!.session!;
  const identity = async () =>
    (await session({
      session: { expires: new Date(Date.now() + 3600000).toISOString() },
      token: { sub: owner.id },
      user: owner,
      newSession: undefined,
      trigger: "update",
    } as Parameters<typeof session>[0])) as Session;
  expect((await identity()).user?.id).toBe(owner.id);
  await changeUserStatus(db, actor.id, owner.id, change(1, "SUSPENDED"));
  expect((await identity()).user).toBeUndefined();
  await changeUserStatus(db, actor.id, owner.id, change(2, "ACTIVE"));
  expect((await identity()).user?.id).toBe(owner.id);
});
test("self-changes are blocked and simultaneous mutual suspensions preserve an active admin", async () => {
  const a = await account("ADMIN"),
    b = await account("ADMIN");
  await expect(
    changeUserStatus(db, a.id, a.id, change(1, "SUSPENDED")),
  ).rejects.toMatchObject({ status: 409 });
  const results = await Promise.allSettled([
    changeUserStatus(db, a.id, b.id, change(1, "SUSPENDED")),
    changeUserStatus(db, b.id, a.id, change(1, "SUSPENDED")),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 403 },
  });
  expect(
    await db.user.count({
      where: { id: { in: [a.id, b.id] }, role: "ADMIN", status: "ACTIVE" },
    }),
  ).toBe(1);
});
test("concurrent updates detect stale versions and missing targets safely", async () => {
  const a = await account("ADMIN"),
    b = await account("ADMIN"),
    target = await account();
  const results = await Promise.allSettled([
    changeUserStatus(db, a.id, target.id, change(1, "SUSPENDED")),
    changeUserStatus(db, b.id, target.id, change(1, "SUSPENDED")),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  await expect(
    changeUserStatus(db, a.id, "missing-user", change(1, "SUSPENDED")),
  ).rejects.toMatchObject({ status: 404 });
});
test("direct status writes advance the version and cannot rewrite it independently", async () => {
  const actor = await account("ADMIN"),
    target = await account();
  await db.user.update({
    where: { id: target.id },
    data: { status: "SUSPENDED" },
  });
  await db.user.update({
    where: { id: target.id },
    data: { status: "ACTIVE", statusVersion: 99 },
  });
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: target.id } }))
      .statusVersion,
  ).toBe(3);
  await db.user.update({
    where: { id: target.id },
    data: { statusVersion: 1 },
  });
  await expect(
    changeUserStatus(db, actor.id, target.id, change(1, "SUSPENDED")),
  ).rejects.toMatchObject({ status: 409 });
});
test("operator provisioning requires a named existing active account and changes only its role", async () => {
  const target = await account(),
    paused = await account("USER", "SUSPENDED");
  expect(await grantAdministrator(db, "absent@admin-test.example")).toEqual({
    outcome: "NOT_FOUND",
  });
  expect(await grantAdministrator(db, paused.email)).toEqual({
    outcome: "SUSPENDED",
  });
  expect(await grantAdministrator(db, target.email.toUpperCase())).toEqual({
    outcome: "GRANTED",
  });
  expect(await grantAdministrator(db, target.email)).toEqual({
    outcome: "ALREADY_ADMIN",
  });
  const saved = await db.user.findUniqueOrThrow({ where: { id: target.id } });
  expect(saved.role).toBe("ADMIN");
  expect(saved.status).toBe("ACTIVE");
  expect(saved.statusVersion).toBe(1);
  expect(saved.passwordHash).toBe(target.passwordHash);
  await expect(grantAdministrator(db, "invalid-email")).rejects.toThrow();
});
