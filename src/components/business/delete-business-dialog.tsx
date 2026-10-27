"use client";

import { useId, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BusinessProfile } from "@/lib/business/constants";

export function DeleteBusinessDialog({
  business,
}: {
  business: BusinessProfile;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/businesses/${business.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationName: confirmation,
          version: business.version,
        }),
      });
      if (!response.ok) {
        const result: { message?: string } = await response.json();
        setError(result.message ?? "Unable to delete the business.");
        setBusy(false);
        return;
      }
      window.location.assign("/businesses");
    } catch {
      setError(
        "We couldn’t confirm deletion. Refresh to check before trying again.",
      );
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-2xl border border-red-600/25 bg-card p-6 sm:p-8"
      aria-labelledby="delete-business-title"
    >
      <h2 id="delete-business-title" className="text-base font-semibold">
        Delete business
      </h2>
      <p className="mt-2 mb-5 max-w-xl text-sm leading-6 text-muted-foreground">
        Permanently delete this business and its associated records. Your
        account and other businesses will remain.
      </p>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            setConfirmation("");
            setError("");
          }
        }}
      >
        <Dialog.Trigger asChild>
          <Button
            variant="outline"
            className="border-red-600/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
          >
            Delete business
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <AlertTriangle
              className="mb-4 size-7 text-red-700 dark:text-red-300"
              aria-hidden="true"
            />
            <Dialog.Title className="pr-6 text-xl font-semibold">
              Delete this business?
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
              This permanently deletes{" "}
              <strong className="break-words text-foreground">
                {business.name}
              </strong>{" "}
              and its associated records. This cannot be undone.
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3"
                aria-label="Close delete confirmation"
                disabled={busy}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
            <form onSubmit={submit} className="mt-5 space-y-4" aria-busy={busy}>
              <div>
                <label htmlFor={id} className="block text-sm font-medium">
                  Type the business name to confirm
                </label>
                <p className="mt-1 mb-2 break-words text-sm text-muted-foreground">
                  {business.name}
                </p>
                <input
                  id={id}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="h-12 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  autoComplete="off"
                  maxLength={120}
                  disabled={busy}
                  required
                />
              </div>
              {error && (
                <div
                  role="alert"
                  className="text-sm text-red-700 dark:text-red-300"
                >
                  <p>{error}</p>
                  <button
                    type="button"
                    className="mt-2 underline"
                    onClick={() => window.location.reload()}
                  >
                    Reload latest details
                  </button>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={busy}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  disabled={busy || confirmation !== business.name}
                  className="bg-red-700 text-white hover:bg-red-800"
                >
                  {busy ? "Deleting…" : "Permanently delete"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
