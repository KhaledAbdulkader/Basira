import { randomUUID } from "node:crypto";
import { test, expect, signInRequest } from "./fixtures";
import { testDatabase as db } from "../helpers/database";

const origin = "http://127.0.0.1:3100";

test("visitors cannot access workspace or identity APIs; auth screen fits the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
});

test("register, sign in, reload, inspect private session, and sign out", async ({
  page,
}) => {
  const email = `${randomUUID()}@browser-test.example`;
  const password = "My long registration passphrase!";
  try {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("New owner");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Try signing in");
    await page.getByRole("link", { name: "Go to sign in" }).click();
    // The registration screen has the same field labels. Wait for the new
    // screen before filling so a pending navigation cannot discard the input.
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    const response = await page.request.get("/api/me");
    const body = await response.json();
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe("USER");
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(response.headers()["cache-control"]).toBe("no-store");
    const cookies = await page.context().cookies();
    const cookie = cookies.find((entry) =>
      entry.name.endsWith("session-token"),
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.value).not.toContain(email);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/me")).status()).toBe(401);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await db.user.deleteMany({ where: { email } });
  }
});

test("wrong, missing, and suspended accounts show the same sign-in error", async ({
  page,
  account,
}) => {
  await page.goto("/login");
  const errors: string[] = [];
  for (const [email, password] of [
    [account.email, "incorrect password"],
    ["missing@browser-test.example", account.password],
    [account.email, account.password],
  ]) {
    if (password === account.password && email === account.email)
      await db.user.update({
        where: { id: account.id },
        data: { status: "SUSPENDED" },
      });
    await page.getByLabel("Email address").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    errors.push((await page.getByRole("alert").textContent())!);
  }
  expect(new Set(errors).size).toBe(1);
  expect((await page.request.get("/api/me")).status()).toBe(401);
});

test("existing sessions see current roles and lose access immediately on suspension", async ({
  page,
  account,
}) => {
  await signInRequest(page.request, account);
  await db.user.update({ where: { id: account.id }, data: { role: "ADMIN" } });
  expect((await (await page.request.get("/api/me")).json()).user.role).toBe(
    "ADMIN",
  );
  await db.user.update({ where: { id: account.id }, data: { role: "USER" } });
  expect((await (await page.request.get("/api/me")).json()).user.role).toBe(
    "USER",
  );
  await db.user.update({
    where: { id: account.id },
    data: { status: "SUSPENDED" },
  });
  expect((await page.request.get("/api/me")).status()).toBe(401);
  expect(
    (await (await page.request.get("/api/auth/session")).json()).user,
  ).toBeUndefined();
  await page.goto("/about");
  await expect(page).toHaveURL(/\/login$/);
});

test("registration rejects cross-site requests, oversized bodies, and privilege injection without leaking duplicates", async ({
  request,
  account,
}) => {
  const input = {
    name: "Owner",
    email: account.email,
    password: account.password,
  };
  expect(
    (await request.post("/api/auth/register", { data: input })).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/auth/register", {
        headers: { origin: "https://other.example" },
        data: input,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/auth/register", {
        headers: { origin },
        data: { ...input, role: "ADMIN" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/auth/register", {
        headers: { origin },
        data: { ...input, name: "x".repeat(9000) },
      })
    ).status(),
  ).toBe(413);
  const newEmail = `${randomUUID()}@browser-test.example`;
  try {
    const first = await request.post("/api/auth/register", {
      headers: { origin },
      data: { ...input, email: newEmail },
    });
    const duplicate = await request.post("/api/auth/register", {
      headers: { origin },
      data: input,
    });
    expect(first.status()).toBe(202);
    expect(duplicate.status()).toBe(202);
    expect(await first.json()).toEqual(await duplicate.json());
  } finally {
    await db.user.deleteMany({ where: { email: newEmail } });
  }
});

test("credentials require CSRF and tampered session cookies cannot authenticate", async ({
  page,
  account,
}) => {
  await page.request.post("/api/auth/callback/credentials", {
    form: { email: account.email, password: account.password, json: "true" },
  });
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await signInRequest(page.request, account);
  const cookies = await page.context().cookies();
  const cookie = cookies.find((entry) => entry.name.endsWith("session-token"))!;
  await page
    .context()
    .addCookies([{ ...cookie, value: `${cookie.value.slice(0, -8)}modified` }]);
  expect((await page.request.get("/api/me")).status()).toBe(401);
});
