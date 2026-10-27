import type { CurrentUser } from "@/lib/auth/access";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: CurrentUser;
  }
}
