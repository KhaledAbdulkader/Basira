import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { createAuthOptions } from "@/lib/auth/options";
import {
  googleIsConfigured,
  readAuthOrigin,
  readAuthSecret,
} from "@/lib/auth/environment";
import { assertAccess, type CurrentUser } from "@/lib/auth/access";

export function getAuthOptions() {
  readAuthOrigin();
  return createAuthOptions(getDatabase(), {
    secret: readAuthSecret(),
    google: googleIsConfigured()
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }
      : undefined,
  });
}

// React cache is scoped to this render/request; never cache identities globally.
export const getCurrentUser = cache(async () => {
  const session = await getServerSession(getAuthOptions());
  return session?.user ?? null;
});

export async function requireUser(role?: CurrentUser["role"]) {
  return assertAccess(await getCurrentUser(), role);
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return assertAccess(user);
}
