import { config } from "dotenv";
import { createDatabaseClient } from "../src/lib/db/create-client";
import { readDatabaseUrl } from "../src/lib/validation/environment";
import { emailSchema } from "../src/lib/validation/auth";
import { grantAdministrator } from "../src/lib/admin/provisioning";
config({ quiet: true });
async function main() {
  const args = process.argv.slice(2),
    email = emailSchema.safeParse(args[1]);
  if (args.length !== 2 || args[0] !== "--email" || !email.success) {
    console.error(
      'Usage: npm run admin:grant -- --email "existing-account@example.com"',
    );
    process.exitCode = 1;
    return;
  }
  const db = createDatabaseClient(readDatabaseUrl(process.env.DATABASE_URL));
  try {
    const { outcome } = await grantAdministrator(db, email.data);
    if (outcome === "NOT_FOUND" || outcome === "SUSPENDED") {
      console.error(
        outcome === "NOT_FOUND"
          ? "No matching account. Register the intended account first."
          : "The account is suspended. This command does not activate accounts.",
      );
      process.exitCode = 1;
      return;
    }
    console.info(
      outcome === "GRANTED"
        ? "Administrator role granted to the explicitly named existing account. Refresh its workspace to see Admin."
        : "The named account is already an administrator.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Administrator provisioning failed. Check the named account and configured database. No database credentials are printed.",
  );
  process.exitCode = 1;
});
