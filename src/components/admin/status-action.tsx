"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import type { AdminUserView } from "@/lib/admin/contracts";

export function StatusAction({
  user,
  isSelf,
}: {
  user: AdminUserView;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const action = nextStatus === "SUSPENDED" ? "Suspend" : "Activate";
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/admin/users/${user.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          version: user.statusVersion,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message ?? "Unable to change this account status.",
        );
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check your connection, then reload to verify this account's current status.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (isSelf)
    return (
      <p className="text-xs text-muted-foreground">
        Your account · self-changes are disabled
      </p>
    );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setError("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="outline">{action} user</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-xl font-semibold">
            {action} this account?
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-7 text-muted-foreground">
            <span className="break-all font-medium text-foreground">
              {user.email}
            </span>
            .{" "}
            {nextStatus === "SUSPENDED"
              ? "This blocks sign-in and subsequent protected requests, including from existing sessions. Business records are retained."
              : "This restores access to the account and its own business records. An unexpired existing session can work again."}
          </Dialog.Description>
          {error && (
            <div
              role="alert"
              className="mt-4 text-sm text-red-700 dark:text-red-300"
            >
              <p>{error}</p>
              <button
                className="mt-2 underline"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
              >
                Reload latest details
              </button>
            </div>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={busy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={confirm}
              disabled={busy}
              className={
                nextStatus === "SUSPENDED"
                  ? "bg-red-700 text-white hover:bg-red-800"
                  : undefined
              }
            >
              {busy ? "Saving…" : `Confirm ${action.toLowerCase()}`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
