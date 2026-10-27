import { z } from "zod";

type DatabaseVariable =
  "DATABASE_URL" | "DIRECT_URL" | "TEST_DATABASE_URL" | "SHADOW_DATABASE_URL";
const postgresUrl = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ["postgresql:", "postgres:"].includes(url.protocol) &&
    Boolean(url.hostname) &&
    url.pathname.length > 1 &&
    !["HOST", "USER", "PASSWORD"].some((placeholder) =>
      [url.hostname.toUpperCase(), url.username, url.password].includes(
        placeholder,
      ),
    )
  );
});

export function readDatabaseUrl(
  value: string | undefined,
  name: DatabaseVariable = "DATABASE_URL",
): string {
  const result = postgresUrl.safeParse(value);
  if (!result.success) {
    // Do not interpolate the supplied value: connection URLs contain passwords.
    throw new Error(
      `Configure ${name} with a valid PostgreSQL connection in your local .env file.`,
    );
  }
  return result.data;
}

export function assertSeparateDatabase(
  primary: string,
  other: string,
  name: DatabaseVariable,
): void {
  const main = new URL(readDatabaseUrl(primary));
  const candidate = new URL(readDatabaseUrl(other, name));
  // Conservatively disallow matching database names even across host aliases.
  if (
    decodeURIComponent(main.pathname) === decodeURIComponent(candidate.pathname)
  ) {
    throw new Error(
      `${name} must name a separate disposable database, not the development database.`,
    );
  }
}

export function readTestDatabaseUrl(
  environment: Record<string, string | undefined>,
): string {
  const databaseUrl = readDatabaseUrl(environment.DATABASE_URL);
  const testUrl = readDatabaseUrl(
    environment.TEST_DATABASE_URL,
    "TEST_DATABASE_URL",
  );
  assertSeparateDatabase(databaseUrl, testUrl, "TEST_DATABASE_URL");
  const databaseName = decodeURIComponent(new URL(testUrl).pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      "TEST_DATABASE_URL must use a dedicated database whose name ends with _test.",
    );
  }
  return testUrl;
}

// Runtime keeps DATABASE_URL; only Prisma CLI uses the optional direct endpoint.
export function readMigrationDatabaseUrl(
  environment: Record<string, string | undefined>,
): string {
  const runtime = readDatabaseUrl(environment.DATABASE_URL);
  if (!environment.DIRECT_URL?.trim()) return runtime;
  const direct = readDatabaseUrl(environment.DIRECT_URL, "DIRECT_URL");
  if (
    decodeURIComponent(new URL(runtime).pathname) !==
    decodeURIComponent(new URL(direct).pathname)
  ) {
    throw new Error("DIRECT_URL must name the same database as DATABASE_URL.");
  }
  return direct;
}
