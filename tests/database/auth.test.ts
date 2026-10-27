import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import type { AdapterUser } from "next-auth/adapters";
import type { Session } from "next-auth";
import { testDatabase as db } from "../helpers/database";
import { registerUser, authenticatePassword } from "@/lib/auth/service";
import { createAuthAdapter } from "@/lib/auth/adapter";
import { createAuthOptions } from "@/lib/auth/options";
import { assertAccess } from "@/lib/auth/access";
import { consumeAuthAttempt } from "@/lib/auth/throttle";

const run = randomUUID();
const secret = `test-secret-${run}`;
const emails: string[] = [];
function email() {
  const value = `${randomUUID()}@auth-test.example`;
  emails.push(value);
  return value;
}
const password = "A long local test passphrase!";
const adapter = createAuthAdapter(db);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

test("registration persists a hash, defaults role/status, and duplicates cannot replace credentials", async () => {
  const address = email();
  await registerUser(db, secret, {
    name: "Test owner",
    email: address.toUpperCase(),
    password,
  });
  const stored = await db.user.findUniqueOrThrow({ where: { email: address } });
  expect(stored.passwordHash).toMatch(/^scrypt\$/);
  expect(stored.passwordHash).not.toBe(password);
  expect(stored.role).toBe("USER");
  expect(stored.status).toBe("ACTIVE");
  expect(stored.emailVerified).toBeNull();
  await registerUser(db, secret, {
    name: "Replacement",
    email: address,
    password: "Different valid password",
  });
  expect(
    (await db.user.findUniqueOrThrow({ where: { email: address } }))
      .passwordHash,
  ).toBe(stored.passwordHash);
  const identity = await authenticatePassword(db, secret, {
    email: address.toUpperCase(),
    password,
  });
  expect(identity?.id).toBe(stored.id);
  expect(identity).not.toHaveProperty("passwordHash");
  expect(
    await authenticatePassword(db, secret, {
      email: address,
      password: "wrong",
    }),
  ).toBeNull();
  expect(
    await authenticatePassword(db, secret, { email: email(), password }),
  ).toBeNull();
});

test("concurrent duplicate registration creates exactly one account", async () => {
  const address = email();
  await Promise.all(
    [1, 2].map(() =>
      registerUser(db, secret, { name: "Owner", email: address, password }),
    ),
  );
  expect(await db.user.count({ where: { email: address } })).toBe(1);
});

test("database rejects noncanonical email and OAuth users cannot log in with a password", async () => {
  const address = email();
  await expect(
    db.user.create({ data: { email: address.toUpperCase() } }),
  ).rejects.toThrow();
  await db.user.create({ data: { email: address } });
  expect(
    await authenticatePassword(db, secret, { email: address, password }),
  ).toBeNull();
});

test("the official adapter persists/retrieves OAuth accounts and preserves nullable password hashes", async () => {
  const address = email();
  const create = adapter.createUser as (
    user: Omit<AdapterUser, "id">,
  ) => Promise<AdapterUser>;
  const owner = await create({
    email: address.toUpperCase(),
    emailVerified: null,
    name: "Google owner",
    image: null,
  });
  expect(owner.email).toBe(address);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash,
  ).toBeNull();
  const account = {
    userId: owner.id,
    type: "oauth" as const,
    provider: "google",
    providerAccountId: run,
  };
  const accountKey = {
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  };
  await adapter.linkAccount!(account);
  expect((await adapter.getUserByAccount!(accountKey))?.id).toBe(owner.id);
  expect((await adapter.getUserByEmail!(address.toUpperCase()))?.id).toBe(
    owner.id,
  );
  await adapter.updateUser!({ id: owner.id, name: "Updated owner" });
  expect((await adapter.getUser!(owner.id))?.name).toBe("Updated owner");
  await adapter.createSession!({
    userId: owner.id,
    sessionToken: run,
    expires: new Date(Date.now() + 60000),
  });
  expect((await adapter.getSessionAndUser!(run))?.user.id).toBe(owner.id);
  await adapter.updateSession!({
    sessionToken: run,
    expires: new Date(Date.now() + 120000),
  });
  await adapter.deleteSession!(run);
  expect(await adapter.getSessionAndUser!(run)).toBeNull();
  const token = {
    identifier: address,
    token: run,
    expires: new Date(Date.now() + 60000),
  };
  await adapter.createVerificationToken!(token);
  const tokenKey = { identifier: token.identifier, token: token.token };
  expect((await adapter.useVerificationToken!(tokenKey))?.token).toBe(run);
  expect(await adapter.useVerificationToken!(tokenKey)).toBeNull();
  await adapter.unlinkAccount!(accountKey);
  expect(await adapter.getUserByAccount!(accountKey)).toBeNull();
  await db.user.update({
    where: { id: owner.id },
    data: { status: "SUSPENDED" },
  });
  await expect(adapter.linkAccount!(account)).rejects.toThrow("Access denied");
  await adapter.deleteUser!(owner.id);
  expect(await adapter.getUser!(owner.id)).toBeNull();
});

test("session callbacks recheck status/role and never trust client role updates", async () => {
  const owner = await db.user.create({
    data: { email: email(), role: "ADMIN" },
  });
  const options = createAuthOptions(db, { secret });
  const sessionCallback = options.callbacks!.session!;
  async function session() {
    return (await sessionCallback({
      session: { expires: new Date(Date.now() + 60000).toISOString() },
      token: { sub: owner.id, role: "ADMIN" },
      user: owner,
      newSession: {},
      trigger: "update",
    })) as Session;
  }
  expect((await session()).user?.role).toBe("ADMIN");
  await db.user.update({ where: { id: owner.id }, data: { role: "USER" } });
  const current = (await session()).user;
  expect(current?.role).toBe("USER");
  expect(() => assertAccess(current, "ADMIN")).toThrow("Access denied");
  expect(current).not.toHaveProperty("passwordHash");
  await db.user.update({
    where: { id: owner.id },
    data: { status: "SUSPENDED" },
  });
  expect((await session()).user).toBeUndefined();
  expect(
    await authenticatePassword(db, secret, { email: owner.email, password }),
  ).toBeNull();
  await db.user.delete({ where: { id: owner.id } });
  expect((await session()).user).toBeUndefined();
});

test("Google rejects unverified email and suspended accounts; unsafe linking is disabled", async () => {
  const owner = await db.user.create({
    data: { email: email(), status: "SUSPENDED" },
  });
  const options = createAuthOptions(db, {
    secret,
    google: { clientId: "test-client", clientSecret: "test-secret" },
  });
  const google = options.providers.find((provider) => provider.id === "google");
  expect(google).toHaveProperty(
    "options.allowDangerousEmailAccountLinking",
    false,
  );
  const signIn = options.callbacks!.signIn!;
  const account = {
    provider: "google",
    type: "oauth" as const,
    providerAccountId: run,
  };
  const profile = (verified: boolean) => ({
    email: owner.email,
    email_verified: verified,
  });
  expect(await signIn({ user: owner, account, profile: profile(true) })).toBe(
    false,
  );
  await db.user.update({ where: { id: owner.id }, data: { status: "ACTIVE" } });
  expect(await signIn({ user: owner, account, profile: profile(false) })).toBe(
    false,
  );
  expect(await signIn({ user: owner, account, profile: profile(true) })).toBe(
    true,
  );
});

test("redirects stay on this origin, including malformed callback URLs", async () => {
  const redirect = createAuthOptions(db, { secret }).callbacks!.redirect!;
  const baseUrl = "https://basira.example";
  expect(await redirect({ url: "/about", baseUrl })).toBe(`${baseUrl}/about`);
  expect(await redirect({ url: "https://other.example", baseUrl })).toBe(
    baseUrl,
  );
  expect(await redirect({ url: "//other.example", baseUrl })).toBe(baseUrl);
  expect(await redirect({ url: "https://[", baseUrl })).toBe(baseUrl);
});

test("shared attempt limits remain atomic under concurrent requests and reset after expiry", async () => {
  const address = email();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      consumeAuthAttempt(db, secret, "login", address),
    ),
  );
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(10);
  expect(
    outcomes.filter((result) => result.status === "rejected"),
  ).toHaveLength(2);
  const { createHmac } = await import("node:crypto");
  const key = createHmac("sha256", secret)
    .update(`login:${address}`)
    .digest("hex");
  await db.authThrottle.update({
    where: { key },
    data: { expiresAt: new Date(0) },
  });
  await expect(
    consumeAuthAttempt(db, secret, "login", address),
  ).resolves.toBeUndefined();
});
