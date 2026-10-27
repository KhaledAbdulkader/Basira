"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { selectBusiness } from "@/components/business/business-switcher";

export function SelectBusinessButton({
  id,
  selected,
}: {
  id: string;
  selected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <Button
        size="sm"
        disabled={busy || selected}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await selectBusiness(id);
          } catch {
            setError("Unable to switch. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Switching…" : selected ? "Current business" : "Open workspace"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
