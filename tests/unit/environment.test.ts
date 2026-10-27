import { describe, expect, it } from "vitest";
import {
  assertSeparateDatabase,
  readDatabaseUrl,
  readTestDatabaseUrl,
} from "@/lib/validation/environment";

const development =
  "postgresql://basira_local:example@localhost:5433/basira_dev?schema=public";
const testDatabase =
  "postgresql://basira_local:example@localhost:5433/basira_test?schema=public";

describe("database configuration boundaries", () => {
  it("accepts standard PostgreSQL URLs and encoded passwords", () => {
    expect(readDatabaseUrl(development)).toBe(development);
    expect(
      readDatabaseUrl("postgres://user:example%3F@localhost:5433/basira_dev"),
    ).toContain("example%3F");
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "https://example.com/db",
    "postgresql://localhost",
    "postgresql://USER:PASSWORD@HOST:5432/DATABASE",
  ])("rejects missing, invalid, or placeholder configuration", (value) => {
    expect(() => readDatabaseUrl(value)).toThrow("Configure DATABASE_URL");
  });

  it("never includes a supplied secret in validation errors", () => {
    const secret = "sensitive-example-token";
    try {
      readDatabaseUrl(`https://user:${secret}@example.com/db`);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
      return;
    }
    throw new Error("Expected invalid configuration to be rejected.");
  });

  it("requires an explicit, separate test database", () => {
    expect(
      readTestDatabaseUrl({
        DATABASE_URL: development,
        TEST_DATABASE_URL: testDatabase,
      }),
    ).toBe(testDatabase);
    expect(() => readTestDatabaseUrl({ DATABASE_URL: development })).toThrow(
      "TEST_DATABASE_URL",
    );
    expect(() =>
      readTestDatabaseUrl({
        DATABASE_URL: development,
        TEST_DATABASE_URL: development,
      }),
    ).toThrow("separate disposable database");
    expect(() =>
      readTestDatabaseUrl({
        DATABASE_URL: development,
        TEST_DATABASE_URL: development.replace("basira_dev", "production"),
      }),
    ).toThrow("ends with _test");
  });

  it("rejects a shadow database that targets development through a host alias or different credentials", () => {
    const alias = "postgresql://different:example@127.0.0.1:5433/basira_dev";
    expect(() =>
      assertSeparateDatabase(development, alias, "SHADOW_DATABASE_URL"),
    ).toThrow("SHADOW_DATABASE_URL");
  });
});
