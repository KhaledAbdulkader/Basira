export const dynamic = "force-dynamic";

// Liveness only. Do not expose connection strings, infrastructure, or user data.
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
