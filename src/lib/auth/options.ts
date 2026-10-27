import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import type { PrismaClient } from "@/generated/prisma/client";
import { createAuthAdapter } from "@/lib/auth/adapter";
import { authenticatePassword, publicUserSelect } from "@/lib/auth/service";
import { emailSchema } from "@/lib/validation/auth";

export function createAuthOptions(
  db: PrismaClient,
  config: {
    secret: string;
    google?: { clientId: string; clientSecret: string };
  },
): NextAuthOptions {
  return {
    adapter: createAuthAdapter(db),
    secret: config.secret,
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      CredentialsProvider({
        name: "Email and password",
        credentials: {
          email: { type: "email" },
          password: { type: "password" },
        },
        async authorize(credentials) {
          try {
            return await authenticatePassword(db, config.secret, credentials);
          } catch {
            // Credential, throttle and infrastructure failures reveal no account details.
            return null;
          }
        },
      }),
      ...(config.google
        ? [
            GoogleProvider({
              ...config.google,
              // Email equality alone must never link an existing password account.
              allowDangerousEmailAccountLinking: false,
            }),
          ]
        : []),
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
        try {
          if (account?.provider === "google") {
            const verified =
              profile &&
              "email_verified" in profile &&
              profile.email_verified === true;
            const email = emailSchema.safeParse(user.email);
            if (!verified || !email.success) return false;
            const existing = await db.user.findUnique({
              where: { email: email.data },
              select: { status: true },
            });
            if (existing?.status === "SUSPENDED") return false;
          }
          if (user.id) {
            const existing = await db.user.findUnique({
              where: { id: user.id },
              select: { status: true },
            });
            if (existing?.status === "SUSPENDED") return false;
          }
          return true;
        } catch {
          // NextAuth can include thrown callback messages in redirects.
          return false;
        }
      },
      async jwt({ token, user }) {
        // Do not copy credentials, profile tokens, or client-supplied session updates.
        return user ? { sub: user.id } : token;
      },
      async session({ session, token }) {
        const user = token.sub
          ? await db.user.findUnique({
              where: { id: token.sub },
              select: publicUserSelect,
            })
          : null;
        // Fresh database role/status, including for already issued JWTs.
        session.user = user?.status === "ACTIVE" ? user : undefined;
        return session;
      },
      redirect({ url, baseUrl }) {
        try {
          const target = new URL(url, baseUrl);
          return target.origin === new URL(baseUrl).origin
            ? target.href
            : baseUrl;
        } catch {
          return baseUrl;
        }
      },
    },
    logger: {
      error(code) {
        console.error("Authentication failed:", code);
      },
      warn(code) {
        console.warn("Authentication warning:", code);
      },
      debug() {},
    },
  };
}
