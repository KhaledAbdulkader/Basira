import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { testDatabase as db } from "../helpers/database";
import {
  createBusiness,
  deleteBusiness,
  getOwnedBusiness,
  listBusinesses,
  lockFinancialSettings,
  updateBusiness,
} from "@/lib/business/service";

let owner: string;
let other: string;
const input = {
  name: "Test cafe",
  businessType: "CAFE",
  location: "Riyadh",
  currency: "SAR",
  timezone: "Asia/Riyadh",
};

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `${randomUUID()}@business-test.example` },
    })
  ).id;
  other = (
    await db.user.create({
      data: { email: `${randomUUID()}@business-test.example`, role: "ADMIN" },
    })
  ).id;
});
afterAll(async () => {
  await db.business.deleteMany({
    where: { ownerId: { in: [owner, other].filter(Boolean) } },
  });
  await db.user.deleteMany({
    where: { id: { in: [owner, other].filter(Boolean) } },
  });
  await db.$disconnect();
});

test("multiple businesses persist separately and owner identity comes from the server", async () => {
  const first = await createBusiness(db, owner, input);
  const second = await createBusiness(db, owner, {
    ...input,
    name: "Other shop",
    businessType: "OTHER",
    otherBusinessType: "Bakery",
    currency: "USD",
    timezone: "America/New_York",
  });
  expect(first.id).not.toBe(second.id);
  expect(first).not.toHaveProperty("ownerId");
  expect((await listBusinesses(db, owner)).map((value) => value.id)).toEqual(
    expect.arrayContaining([first.id, second.id]),
  );
  expect(await listBusinesses(db, other)).toEqual([]);
  expect((await getOwnedBusiness(db, owner, second.id)).currency).toBe("USD");
  await expect(
    createBusiness(db, owner, { ...input, ownerId: other }),
  ).rejects.toThrow();
});

test("foreign IDs are hidden from reads, edits, deletion and even an ADMIN", async () => {
  const business = await createBusiness(db, owner, input);
  await expect(getOwnedBusiness(db, other, business.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(getOwnedBusiness(db, other, "missing-id")).rejects.toMatchObject(
    { status: 404, message: "Business not found." },
  );
  await expect(
    updateBusiness(db, other, business.id, {
      ...input,
      version: business.version,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    deleteBusiness(db, other, business.id, {
      confirmationName: business.name,
      version: business.version,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    db.$transaction((tx) => lockFinancialSettings(tx, other, business.id)),
  ).rejects.toMatchObject({ status: 404 });
});

test("suspended owners cannot use service entry points with stale caller information", async () => {
  const user = await db.user.create({
    data: { email: `${randomUUID()}@business-test.example` },
  });
  try {
    const business = await createBusiness(db, user.id, input);
    await db.user.update({
      where: { id: user.id },
      data: { status: "SUSPENDED" },
    });
    await expect(listBusinesses(db, user.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      getOwnedBusiness(db, user.id, business.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(createBusiness(db, user.id, input)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      updateBusiness(db, user.id, business.id, { ...input, version: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteBusiness(db, user.id, business.id, {
        confirmationName: input.name,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.business.deleteMany({ where: { ownerId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});

test("settings can change before financial history; stale edits cannot overwrite newer changes", async () => {
  const business = await createBusiness(db, owner, input);
  const updated = await updateBusiness(db, owner, business.id, {
    ...input,
    name: "Updated",
    currency: "USD",
    timezone: "UTC",
    version: business.version,
  });
  expect(updated).toMatchObject({
    name: "Updated",
    currency: "USD",
    timezone: "UTC",
    version: 2,
  });
  await expect(
    updateBusiness(db, owner, business.id, { ...input, version: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await getOwnedBusiness(db, owner, business.id)).name).toBe("Updated");
});

test("financial settings lock is permanent while ordinary profile fields remain editable", async () => {
  const business = await createBusiness(db, owner, input);
  const locked = await db.$transaction((tx) =>
    lockFinancialSettings(tx, owner, business.id),
  );
  expect(locked.financialSettingsLockedAt).not.toBeNull();
  for (const change of [{ currency: "USD" }, { timezone: "UTC" }]) {
    await expect(
      updateBusiness(db, owner, business.id, {
        ...input,
        ...change,
        version: locked.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
  }
  await expect(
    db.business.update({
      where: { id: business.id },
      data: { currency: "USD" },
    }),
  ).rejects.toThrow();
  await expect(
    db.business.update({
      where: { id: business.id },
      data: { timezone: "UTC" },
    }),
  ).rejects.toThrow();
  await expect(
    db.business.update({
      where: { id: business.id },
      data: { financialSettingsLockedAt: null },
    }),
  ).rejects.toThrow();
  expect(
    (
      await updateBusiness(db, owner, business.id, {
        ...input,
        name: "Renamed",
        version: locked.version,
      })
    ).name,
  ).toBe("Renamed");
});

test("locking rolls back with a failed future financial transaction", async () => {
  const business = await createBusiness(db, owner, input);
  await expect(
    db.$transaction(async (tx) => {
      await lockFinancialSettings(tx, owner, business.id);
      throw new Error("Simulated insert failure");
    }),
  ).rejects.toThrow("Simulated");
  expect(
    (await getOwnedBusiness(db, owner, business.id)).financialSettingsLockedAt,
  ).toBeNull();
  expect((await getOwnedBusiness(db, owner, business.id)).version).toBe(1);
});

test("a concurrent currency change cannot cross the first financial-write lock", async () => {
  const business = await createBusiness(db, owner, input);
  const locked = signal();
  const release = signal();
  const transaction = db.$transaction(async (tx) => {
    await lockFinancialSettings(tx, owner, business.id);
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  const edit = updateBusiness(db, owner, business.id, {
    ...input,
    currency: "USD",
    version: 1,
  });
  release.resolve();
  await transaction;
  await expect(edit).rejects.toMatchObject({ status: 409 });
  expect((await getOwnedBusiness(db, owner, business.id)).currency).toBe("SAR");
});

test("deletion requires exact current name/version, preserves other businesses, and restricts user deletion", async () => {
  const first = await createBusiness(db, owner, input);
  const second = await createBusiness(db, owner, {
    ...input,
    name: "Keep this business",
  });
  await expect(
    deleteBusiness(db, owner, first.id, {
      confirmationName: "wrong",
      version: 1,
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    deleteBusiness(db, owner, first.id, {
      confirmationName: first.name,
      version: 99,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(db.user.delete({ where: { id: owner } })).rejects.toThrow();
  await deleteBusiness(db, owner, first.id, {
    confirmationName: first.name,
    version: first.version,
  });
  expect(await db.business.findUnique({ where: { id: first.id } })).toBeNull();
  expect((await getOwnedBusiness(db, owner, second.id)).name).toBe(second.name);
});
