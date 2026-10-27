import type { PrismaClient } from "@/generated/prisma/client";
import { emailSchema } from "@/lib/validation/auth";

// Operator-only helper for the explicit local CLI. Never expose this in a route.
export async function grantAdministrator(db: PrismaClient, input: unknown) {
  const email = emailSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "email" = ${email} FOR UPDATE`;
    const account = await tx.user.findUnique({
      where: { email },
      select: { id: true, role: true, status: true },
    });
    if (!account) return { outcome: "NOT_FOUND" as const };
    if (account.status !== "ACTIVE") return { outcome: "SUSPENDED" as const };
    if (account.role === "ADMIN") return { outcome: "ALREADY_ADMIN" as const };
    await tx.user.update({
      where: { id: account.id },
      data: { role: "ADMIN" },
    });
    return { outcome: "GRANTED" as const };
  });
}
