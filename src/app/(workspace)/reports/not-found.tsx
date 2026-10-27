import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ReportNotFound() {
  return (
    <section className="mx-auto max-w-lg space-y-5 py-16 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-3xl font-semibold">Report not found</h1>
      <p className="text-sm leading-7 text-muted-foreground">
        This report is not available for the selected business. Choose the
        business that owns it or return to report history.
      </p>
      <Button asChild>
        <Link href="/reports">Report history</Link>
      </Button>
    </section>
  );
}
