import { createHmac } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export class AuthRateLimitError extends Error {
  constructor() {
    super("Too many attempts. Please try again later.");
  }
}

export async function consumeAuthAttempt(
  db: PrismaClient,
  secret: string,
  action: "login" | "register",
  email: string,
) {
  const now = new Date();
  await db.authThrottle.deleteMany({ where: { expiresAt: { lt: now } } });
  const buckets = [
    { value: "global", limit: 100, seconds: 60 },
    {
      value: `${action}:${email}`,
      limit: action === "login" ? 10 : 5,
      seconds: action === "login" ? 900 : 3600,
    },
  ];
  for (const bucket of buckets) {
    const key = createHmac("sha256", secret).update(bucket.value).digest("hex");
    const expires = new Date(now.getTime() + bucket.seconds * 1000);
    // Atomic across Node instances; no reliance on spoofable forwarded-IP headers.
    const rows = await db.$queryRaw<{ attempts: number }[]>`
      INSERT INTO "AuthThrottle" ("key", "attempts", "expiresAt") VALUES (${key}, 1, ${expires})
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "AuthThrottle"."expiresAt" <= ${now} THEN 1 ELSE "AuthThrottle"."attempts" + 1 END,
        "expiresAt" = CASE WHEN "AuthThrottle"."expiresAt" <= ${now} THEN ${expires} ELSE "AuthThrottle"."expiresAt" END
      RETURNING "attempts"
    `;
    if (!rows[0] || rows[0].attempts > bucket.limit)
      throw new AuthRateLimitError();
  }
}
