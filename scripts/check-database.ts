import { config } from "dotenv";
import { createDatabaseClient } from "../src/lib/db/create-client";
import {
  readDatabaseUrl,
  readTestDatabaseUrl,
} from "../src/lib/validation/environment";

config({ quiet: true });

async function main() {
  const testMode = process.argv.includes("--test");
  const url = testMode
    ? readTestDatabaseUrl(process.env)
    : readDatabaseUrl(process.env.DATABASE_URL);
  const db = createDatabaseClient(url);

  try {
    const result = await db.$queryRaw<
      { ready: number }[]
    >`SELECT 1::integer AS ready`;
    if (result[0]?.ready !== 1)
      throw new Error("Unexpected connectivity result.");

    if (testMode) {
      // Real Prisma/PostgreSQL checks, with no permanent schema changes.
      await db.$transaction(async (transaction) => {
        await transaction.$executeRaw`CREATE TEMP TABLE basira_foundation_check (amount numeric(19,4) NOT NULL) ON COMMIT DROP`;
        await transaction.$executeRaw`INSERT INTO basira_foundation_check (amount) VALUES (0.1), (0.2)`;
        const sum = await transaction.$queryRaw<
          { total: string }[]
        >`SELECT SUM(amount)::text AS total FROM basira_foundation_check`;
        if (sum[0]?.total !== "0.3000")
          throw new Error("Decimal database check failed.");
      });
      const remaining = await db.$queryRaw<
        { name: string | null }[]
      >`SELECT to_regclass('pg_temp.basira_foundation_check')::text AS name`;
      if (remaining[0]?.name !== null)
        throw new Error("Temporary table cleanup failed.");
      console.info(
        "PASS: Prisma connection, transactional writes, exact decimal aggregation, and temporary-table cleanup.",
      );
    } else {
      console.info(
        "PASS: Prisma connected to the configured development database.",
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  // Driver errors may contain credentials or SQL details. Keep CLI output safe.
  console.error(
    "Database check failed. Verify the dedicated database, role, password, host, and port in .env. Test database names must end with _test and differ from development.",
  );
  process.exitCode = 1;
});
