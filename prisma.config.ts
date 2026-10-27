import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import {
  assertSeparateDatabase,
  readMigrationDatabaseUrl,
} from "./src/lib/validation/environment";

config({ quiet: true });

if (process.env.DATABASE_URL && process.env.SHADOW_DATABASE_URL) {
  assertSeparateDatabase(
    process.env.DATABASE_URL,
    process.env.SHADOW_DATABASE_URL,
    "SHADOW_DATABASE_URL",
  );
}

if (process.env.TEST_DATABASE_URL && process.env.SHADOW_DATABASE_URL) {
  assertSeparateDatabase(
    process.env.TEST_DATABASE_URL,
    process.env.SHADOW_DATABASE_URL,
    "SHADOW_DATABASE_URL",
  );
}

// Generation/builds do not need database credentials. Database commands do.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL || process.env.DIRECT_URL
        ? readMigrationDatabaseUrl(process.env)
        : "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
