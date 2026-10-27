import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { googleIsConfigured } from "@/lib/auth/environment";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return <AuthForm mode="register" googleEnabled={googleIsConfigured()} />;
}
