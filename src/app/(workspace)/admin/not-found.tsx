import Link from "next/link";
export default function AdminNotFound() {
  return (
    <section className="space-y-4 py-12">
      <h1 className="text-2xl font-semibold">Administration unavailable</h1>
      <p>This page requires an active administrator account.</p>
      <Link href="/" className="text-primary underline">
        Return to overview
      </Link>
    </section>
  );
}
