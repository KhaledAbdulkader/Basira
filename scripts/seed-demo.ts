import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabaseClient } from "../src/lib/db/create-client";
import { verifyPassword } from "../src/lib/auth/password";
import { businessToday } from "../src/lib/records/dates";
import { addDays } from "../src/lib/dashboard/period";
import { readDemoDatabaseUrl } from "./demo/environment";
import { DEMO_EMAIL, DEMO_TIMEZONE, DEMO_USER_ID } from "./demo/data";
import { DemoSeedError, seedDemo } from "./demo/seed";

config({ quiet: true });
async function main() {
  if (process.argv.slice(2).join(" ") !== "--local")
    throw new DemoSeedError("Usage: npm run db:seed:demo -- --local");
  const url = readDemoDatabaseUrl(process.env);
  const db = createDatabaseClient(url);
  try {
    const existing = await db.user.findFirst({
      where: { OR: [{ id: DEMO_USER_ID }, { email: DEMO_EMAIL }] },
    });
    if (
      existing &&
      (existing.id !== DEMO_USER_ID || existing.email !== DEMO_EMAIL)
    )
      throw new DemoSeedError(
        "The reserved demo identity is already in use. No accounts were changed.",
      );
    // Persist once before writes, so an interrupted run can reuse its password.
    const path = resolve(".local/demo-access.json");
    await mkdir(resolve(".local"), { recursive: true });
    if (!existing)
      try {
        const file = await open(path, "wx", 0o600);
        try {
          await file.writeFile(
            JSON.stringify(
              {
                email: DEMO_EMAIL,
                password: randomBytes(24).toString("base64url"),
              },
              null,
              2,
            ) + "\n",
          );
        } finally {
          await file.close();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    const content = await readFile(path, "utf8").catch(() => {
      throw new DemoSeedError(
        "The demo account exists but its access file is unavailable. Restore .local/demo-access.json; this command does not reset passwords.",
      );
    });
    const access = JSON.parse(content) as {
      email: string;
      password: string;
    };
    if (access.email !== DEMO_EMAIL || typeof access.password !== "string")
      throw new DemoSeedError(
        "The local demo access file is invalid. No database changes were made.",
      );
    if (
      existing &&
      !(await verifyPassword(access.password, existing.passwordHash))
    )
      throw new DemoSeedError(
        "The saved demo password no longer matches. No accounts or passwords were changed.",
      );
    const endDate = addDays(businessToday(DEMO_TIMEZONE), -1);
    const result = await seedDemo(db, access.password, endDate);
    console.info(
      result.created
        ? `Created synthetic demo data through ${endDate}.`
        : "Demo already exists; no records or passwords changed.",
    );
    console.info(
      `Demo sign-in: ${DEMO_EMAIL}. Password is in .local/demo-access.json (ignored by Git).`,
    );
    for (const business of result.businesses) console.info(business.name);
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof DemoSeedError
      ? error.message
      : "Demo seed failed. Check the local *_dev/*_demo connection, applied migrations and .local/demo-access.json. No credentials are printed.",
  );
  process.exitCode = 1;
});
