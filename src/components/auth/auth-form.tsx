"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginSchema, registrationSchema } from "@/lib/validation/auth";

const inputClass =
  "h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function AuthForm({
  mode,
  googleEnabled,
  hasError = false,
}: {
  mode: "login" | "register";
  googleEnabled: boolean;
  hasError?: boolean;
}) {
  const registering = mode === "register";
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    hasError
      ? "We couldn’t sign you in. Try your original sign-in method or try again later."
      : "",
  );
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const input = {
      email: form.get("email"),
      password: form.get("password"),
      ...(registering ? { name: form.get("name") } : {}),
    };
    const parsed = (registering ? registrationSchema : loginSchema).safeParse(
      input,
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }
    setBusy(true);
    try {
      if (registering) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const result: { message?: string } = await response.json();
        if (!response.ok) {
          setError(result.message ?? "Please try again later.");
          return;
        }
        setMessage(result.message ?? "Try signing in with your chosen method.");
      } else {
        const result = await signIn("credentials", {
          ...parsed.data,
          redirect: false,
          callbackUrl: "/",
        });
        if (!result?.ok || result.error) {
          setError("Unable to sign in. Check your details or try again later.");
        } else {
          // Full navigation clears any client router cache from a previous identity.
          window.location.assign("/");
        }
      }
    } catch {
      setError("We couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setError("");
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Google sign-in is unavailable. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-7">
        <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">
          {registering ? "Your next chapter" : "A fresh perspective"}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {registering ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {registering
            ? "A little clarity starts here. Make a space for your business."
            : "Sign in to your Basira workspace."}
        </p>
      </div>
      <Button
        className="h-12 w-full"
        variant="outline"
        disabled={!googleEnabled || busy}
        onClick={googleSignIn}
        aria-describedby={!googleEnabled ? "google-note" : undefined}
      >
        <span aria-hidden="true" className="text-base font-bold">
          G
        </span>{" "}
        Continue with Google
      </Button>
      {!googleEnabled && (
        <p
          id="google-note"
          className="mt-2 text-center text-xs text-muted-foreground"
        >
          Google sign-in is not available yet. You can use email below.
        </p>
      )}
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
        {registering && (
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="name">
              Your name
            </label>
            <input
              className={inputClass}
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              disabled={busy}
            />
          </div>
        )}
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="email">
            Email address
          </label>
          <input
            className={inputClass}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              className={`${inputClass} pr-12`}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={registering ? "new-password" : "current-password"}
              required
              minLength={registering ? 12 : 1}
              maxLength={128}
              disabled={busy}
              aria-describedby={registering ? "password-hint" : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </Button>
          </div>
          {registering && (
            <p
              id="password-hint"
              className="text-xs leading-5 text-muted-foreground"
            >
              Use 12–128 characters. A few memorable words work well.
            </p>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-600/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {message && (
          <div
            role="status"
            className="rounded-lg border border-primary/25 bg-accent p-3 text-sm leading-6"
          >
            <p>{message}</p>
            <Link
              className="font-semibold text-primary underline underline-offset-4"
              href="/login"
            >
              Go to sign in
            </Link>
          </div>
        )}
        <Button type="submit" className="h-12 w-full" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Please wait
            </>
          ) : (
            <>
              {registering ? "Create account" : "Sign in"}
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {registering ? "Already have an account?" : "New to Basira?"}{" "}
        <Link
          className="font-semibold text-primary underline-offset-4 hover:underline"
          href={registering ? "/login" : "/register"}
        >
          {registering ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
