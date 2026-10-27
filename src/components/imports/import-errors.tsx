"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function ImportErrors({
  errors,
}: {
  errors: { row: number; errors: string[] }[];
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(errors.length / 25));
  if (!errors.length)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Every row passed validation.
      </p>
    );
  return (
    <div className="mt-4">
      <ul className="space-y-3">
        {errors.slice((page - 1) * 25, page * 25).map((row) => (
          <li key={row.row} className="rounded-lg border p-3 text-sm">
            <p className="font-semibold">Row {row.row}</p>
            {row.errors.map((error, i) => (
              <p key={i} className="mt-1 text-destructive">
                {error}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <p>
          Page {page} of {pages}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous errors
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next errors
        </Button>
      </div>
    </div>
  );
}
