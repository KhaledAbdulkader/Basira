import { readDatabaseUrl } from "../../src/lib/validation/environment";

export function readDemoDatabaseUrl(
  environment: Record<string, string | undefined>,
) {
  if (
    environment.NODE_ENV === "production" ||
    environment.VERCEL ||
    environment.CI
  )
    throw new Error(
      "Demo seeding runs only from a local development terminal.",
    );
  const value = readDatabaseUrl(environment.DATABASE_URL);
  const url = new URL(value);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^[a-zA-Z0-9_]+_(dev|demo)$/.test(name) ||
    [...url.searchParams.keys()].some((key) => key !== "schema") ||
    (url.searchParams.has("schema") &&
      url.searchParams.get("schema") !== "public")
  )
    throw new Error(
      "Demo seeding requires a local *_dev or *_demo database with the public schema.",
    );
  return value;
}
