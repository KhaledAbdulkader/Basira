import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

// Shared by the server-only application entry point and local database checks.
export function createDatabaseClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  // Fluid compute can suspend an instance before ordinary idle timers fire.
  if (process.env.VERCEL === "1") attachDatabasePool(pool);
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({ adapter, log: [] });
}
