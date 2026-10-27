import "server-only";
import { createDatabaseClient } from "@/lib/db/create-client";
import { readDatabaseUrl } from "@/lib/validation/environment";

const globalDatabase = globalThis as unknown as {
  basiraDatabase?: ReturnType<typeof createDatabaseClient>;
};

export function getDatabase() {
  // Lazy creation avoids requiring a database during static page generation.
  globalDatabase.basiraDatabase ??= createDatabaseClient(
    readDatabaseUrl(process.env.DATABASE_URL),
  );
  return globalDatabase.basiraDatabase;
}
