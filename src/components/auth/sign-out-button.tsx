"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await signOut({ redirect: false, callbackUrl: "/login" });
            window.location.assign("/login");
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
      >
        <LogOut aria-hidden="true" />
        <span>{busy ? "Signing out…" : "Sign out"}</span>
      </Button>
      {failed && (
        <p
          role="alert"
          className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-border bg-card p-3 text-xs"
        >
          Unable to sign out. Try again.
        </p>
      )}
    </div>
  );
}
