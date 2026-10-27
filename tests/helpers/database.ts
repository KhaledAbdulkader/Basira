import { config } from "dotenv";
import { createDatabaseClient } from "../../src/lib/db/create-client";
import { readTestDatabaseUrl } from "../../src/lib/validation/environment";

config({ quiet: true });

// Validate isolation before any test can write. Never fall back to DATABASE_URL.
export const testDatabase = createDatabaseClient(
  readTestDatabaseUrl(process.env),
);
