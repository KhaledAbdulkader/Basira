import "server-only";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server";
export async function requireAdminPage() {
  const user = await requirePageUser();
  if (user.role !== "ADMIN") notFound();
  return user;
}
