import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { loginSchema, registrationSchema } from "@/lib/validation/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { consumeAuthAttempt } from "@/lib/auth/throttle";

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

export async function registerUser(
  db: PrismaClient,
  secret: string,
  input: unknown,
) {
  const data = registrationSchema.parse(input);
  await consumeAuthAttempt(db, secret, "register", data.email);
  // Hash on both new and duplicate requests; never return account existence.
  const passwordHash = await hashPassword(data.password);
  try {
    await db.user.create({
      data: { name: data.name, email: data.email, passwordHash },
      select: { id: true },
    });
  } catch (error) {
    if (!(
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ))
      throw error;
  }
}

export async function authenticatePassword(
  db: PrismaClient,
  secret: string,
  input: unknown,
) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  await consumeAuthAttempt(db, secret, "login", email);
  const user = await db.user.findUnique({
    where: { email },
    select: { ...publicUserSelect, passwordHash: true },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!valid || !user || user.status !== "ACTIVE") return null;
  const { passwordHash: _passwordHash, ...identity } = user;
  void _passwordHash;
  return identity;
}
