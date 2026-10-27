import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6">
      <span className="sr-only">Loading page…</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-60 w-full" />
    </div>
  );
}
