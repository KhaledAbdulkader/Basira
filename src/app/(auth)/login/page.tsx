import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { googleIsConfigured } from "@/lib/auth/environment";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AuthForm
      mode="login"
      googleEnabled={googleIsConfigured()}
      hasError={Boolean((await searchParams).error)}
    />
  );
}
