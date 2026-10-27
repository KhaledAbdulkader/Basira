import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { readTestDatabaseUrl } from "../src/lib/validation/environment";

config({ quiet: true });
const testUrl = readTestDatabaseUrl(process.env);
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    // Override BOTH: an operator's direct production URL must never reach tests.
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
  },
);
process.exitCode = result.status ?? 1;
