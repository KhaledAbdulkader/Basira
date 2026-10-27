// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAccess, type CurrentUser } from "@/lib/auth/access";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  readAuthOrigin,
  readAuthSecret,
  googleIsConfigured,
} from "@/lib/auth/environment";
import { registrationSchema } from "@/lib/validation/auth";
import { readLimitedText, requireSameOrigin } from "@/lib/http/request";

afterEach(() => vi.unstubAllEnvs());
const user: CurrentUser = {
  id: "test",
  name: "Owner",
  email: "owner@example.test",
  image: null,
  role: "USER",
  status: "ACTIVE",
};

describe("authentication boundaries", () => {
  it("hashes with independent salts and verifies without changing Unicode/whitespace", async () => {
    const password = "  a long سري passphrase  ";
    const first = await hashPassword(password);
    expect(first).not.toContain(password);
    expect(first).not.toBe(await hashPassword(password));
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
    expect(await verifyPassword(password, null)).toBe(false);
    expect(await verifyPassword(password, "scrypt$9999999999$garbage")).toBe(
      false,
    );
  });

  it("normalizes emails, keeps password spaces, and rejects injected roles", () => {
    const input = {
      name: " Owner ",
      email: " OWNER@EXAMPLE.TEST ",
      password: "  a long passphrase  ",
    };
    expect(registrationSchema.parse(input)).toEqual({
      ...input,
      name: "Owner",
      email: "owner@example.test",
    });
    expect(
      registrationSchema.safeParse({ ...input, role: "ADMIN" }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...input, password: "short" }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...input, password: "x".repeat(129) })
        .success,
    ).toBe(false);
  });

  it("requires an active identity and explicit admin role", () => {
    expect(() => assertAccess(null)).toThrow("Sign in");
    expect(() => assertAccess({ ...user, status: "SUSPENDED" })).toThrow(
      "Access denied",
    );
    expect(() => assertAccess(user, "ADMIN")).toThrow("Access denied");
    expect(assertAccess({ ...user, role: "ADMIN" }, "ADMIN").id).toBe(user.id);
  });

  it("rejects placeholder/weak secrets and non-HTTPS remote origins", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "REPLACE_WITH_A_SECURE_RANDOM_SECRET");
    expect(readAuthSecret).toThrow("NEXTAUTH_SECRET");
    vi.stubEnv("NEXTAUTH_URL", "http://example.com");
    expect(readAuthOrigin).toThrow("HTTPS");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(readAuthOrigin()).toBe("http://localhost:3000");
    vi.stubEnv("GOOGLE_CLIENT_ID", "REPLACE_WITH_GOOGLE_CLIENT_ID");
    expect(googleIsConfigured()).toBe(false);
  });

  it("rejects cross-site or missing origins", () => {
    const origin = "https://basira.example";
    expect(() =>
      requireSameOrigin(new Request(origin, { headers: { origin } }), origin),
    ).not.toThrow();
    expect(() => requireSameOrigin(new Request(origin), origin)).toThrow();
    expect(() =>
      requireSameOrigin(
        new Request(origin, {
          headers: { origin: "https://attacker.example" },
        }),
        origin,
      ),
    ).toThrow();
  });

  it("limits streamed bodies even without Content-Length", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "é".repeat(100),
    });
    await expect(readLimitedText(request, 100)).rejects.toMatchObject({
      status: 413,
    });
    expect(
      await readLimitedText(
        new Request("http://localhost", { method: "POST", body: "hello" }),
      ),
    ).toBe("hello");
  });
});
