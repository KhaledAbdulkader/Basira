import { describe, expect, test } from "vitest";
import {
  adminBusinessesQuery,
  adminUsersQuery,
  userStatusMutation,
  adminQuery,
  literalSearch,
} from "@/lib/admin/contracts";
import { adminFailure } from "@/lib/admin/http";
import { AccessError } from "@/lib/auth/access";
import { RequestError } from "@/lib/http/request";
describe("administration contracts", () => {
  test("defaults, trimmed search and bounded filters", () => {
    expect(adminUsersQuery.parse({})).toEqual({
      page: 1,
      q: "",
      role: "ALL",
      status: "ALL",
    });
    expect(
      adminUsersQuery.parse({
        q: "  Owner  ",
        page: "2",
        status: "SUSPENDED",
        role: "ADMIN",
      }).q,
    ).toBe("Owner");
    expect(adminBusinessesQuery.parse({ type: "CAFE" }).type).toBe("CAFE");
    for (const input of [
      { page: 0 },
      { page: 1.2 },
      { page: 100001 },
      { status: "DELETED" },
      { q: "x".repeat(121) },
      { q: "a\nb" },
      { ownerId: "forged" },
      { role: ["ADMIN", "USER"] },
    ])
      expect(adminUsersQuery.safeParse(input).success).toBe(false);
    expect(adminBusinessesQuery.safeParse({ type: "UNKNOWN" }).success).toBe(
      false,
    );
  });
  test("status changes require confirmation and a version, not client roles", () => {
    const valid = { version: 1, status: "SUSPENDED", confirmed: true };
    expect(userStatusMutation.safeParse(valid).success).toBe(true);
    for (const input of [
      { ...valid, confirmed: false },
      { ...valid, version: "1" },
      { ...valid, role: "ADMIN" },
      { ...valid, userId: "someone" },
      { status: "ACTIVE", confirmed: true },
      { ...valid, status: "DELETED" },
    ])
      expect(userStatusMutation.safeParse(input).success).toBe(false);
  });
  test("query duplicates and wildcard search have explicit behavior", () => {
    expect(() =>
      adminQuery(
        new Request("https://basira.example/admin?status=ALL&status=ACTIVE"),
      ),
    ).toThrow();
    expect(literalSearch(String.raw`50%_cafe\name`)).toBe(
      String.raw`50\%\_cafe\\name`,
    );
    expect(
      adminQuery(new Request("https://basira.example/admin?q=cafe&page=2")),
    ).toEqual({ q: "cafe", page: "2" });
  });
  test("failures are safe and non-cacheable", async () => {
    for (const status of [401, 403] as const)
      expect(adminFailure(new AccessError(status)).status).toBe(status);
    expect(adminFailure(new RequestError(409, "Reload status.")).status).toBe(
      409,
    );
    const result = adminFailure(
      new Error("private password=hidden-database-detail"),
    );
    expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await result.json())).not.toContain(
      "hidden-database-detail",
    );
    expect(adminFailure(new SyntaxError()).status).toBe(400);
    expect(
      adminFailure(adminUsersQuery.safeParse({ page: 0 }).error).status,
    ).toBe(400);
  });
});
