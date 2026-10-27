import { randomUUID } from "node:crypto";
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { testDatabase as db } from "../helpers/database";
import { hashPassword } from "../../src/lib/auth/password";

type Account = { id: string; email: string; password: string };
export const test = base.extend<{ account: Account }>({
  account: async ({ baseURL }, use) => {
    void baseURL;
    const email = `${randomUUID()}@browser-test.example`;
    const password = "A long browser test passphrase!";
    const owner = await db.user.create({
      data: {
        email,
        name: "Test owner",
        passwordHash: await hashPassword(password),
      },
    });
    try {
      await use({ id: owner.id, email, password });
    } finally {
      await db.business.deleteMany({ where: { ownerId: owner.id } });
      await db.user.deleteMany({ where: { id: owner.id } });
    }
  },
});

export async function signInRequest(
  request: APIRequestContext,
  account: Account,
) {
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const response = await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email: account.email,
      password: account.password,
      callbackUrl: "http://127.0.0.1:3100/",
      json: "true",
    },
  });
  expect(response.ok()).toBe(true);
  expect((await request.get("/api/me")).status()).toBe(200);
}

export const authenticatedTest = test.extend({
  page: async ({ page, account }, use) => {
    await signInRequest(page.request, account);
    await use(page);
  },
});

test.afterAll(async () => {
  await db.$disconnect();
});
export { expect };
