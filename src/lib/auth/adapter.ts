import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { Adapter, AdapterUser, AdapterAccount } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";
import { emailSchema } from "@/lib/validation/auth";

export function createAuthAdapter(db: PrismaClient): Adapter {
  const adapter = PrismaAdapter(db);
  return {
    ...adapter,
    createUser: (user: Omit<AdapterUser, "id">) =>
      db.user.create({
        data: {
          name: user.name,
          email: emailSchema.parse(user.email),
          image: user.image,
          emailVerified: user.emailVerified,
        },
      }),
    getUserByEmail: (email) =>
      db.user.findUnique({ where: { email: emailSchema.parse(email) } }),
    async linkAccount(account: AdapterAccount) {
      const user = await db.user.findUnique({
        where: { id: account.userId },
        select: { status: true },
      });
      if (user?.status !== "ACTIVE") throw new Error("Access denied.");
      return db.account.create({ data: account });
    },
    updateUser: ({ id, name, email, image, emailVerified }) =>
      db.user.update({
        where: { id },
        data: {
          name,
          image,
          emailVerified,
          ...(email === undefined ? {} : { email: emailSchema.parse(email) }),
        },
      }),
  };
}
