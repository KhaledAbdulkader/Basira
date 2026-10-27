import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getDatabase } from "@/lib/db/client";
import { getRecordOptions, listRecords } from "@/lib/records/service";
import { recordQuerySchema } from "@/lib/validation/records";
import { businessToday } from "@/lib/records/dates";
import { RECORD_LABELS, type RecordResource } from "@/lib/records/types";
import { RecordWorkspace } from "./record-workspace";
import { getFeedbackInsights } from "@/lib/feedback/service";

export type RecordSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;
export async function RecordsPage({
  resource,
  searchParams,
}: {
  resource: RecordResource;
  searchParams: RecordSearchParams;
}) {
  const user = await requirePageUser();
  const { selectedBusiness: business } = await getWorkspaceBusinesses();
  if (!business)
    return (
      <section className="rounded-2xl border bg-card p-8">
        <h1 className="text-2xl font-semibold">
          {RECORD_LABELS[resource].title}
        </h1>
        <p className="mt-3 mb-6 text-muted-foreground">
          Create a business to start recording its data.
        </p>
        <Link
          className="font-medium text-primary underline"
          href="/businesses/new"
        >
          Create your first business
        </Link>
      </section>
    );
  const search = await searchParams;
  const filters = Object.fromEntries(
    Object.entries(search).filter(
      (entry): entry is [string, string] =>
        entry[0] !== "saved" && typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
  const parsed = recordQuerySchema.safeParse(filters);
  if (!parsed.success) {
    return (
      <section className="rounded-2xl border bg-card p-8">
        <h1 className="text-2xl font-semibold">Check your filters</h1>
        <p className="my-4" role="alert">
          {parsed.error.issues[0]?.message}
        </p>
        <Link className="text-primary underline" href={`/${resource}`}>
          Reset filters
        </Link>
      </section>
    );
  }
  const query = parsed.data;
  const [result, options, feedbackInsights] = await Promise.all([
    listRecords(getDatabase(), user.id, business.id, resource, query),
    getRecordOptions(getDatabase(), user.id, business.id),
    resource === "feedback"
      ? getFeedbackInsights(getDatabase(), user.id, business.id)
      : Promise.resolve(undefined),
  ]);
  return (
    <RecordWorkspace
      key={`${business.id}-${resource}`}
      business={business}
      resource={resource}
      result={result}
      options={options}
      query={query}
      today={businessToday(business.timezone)}
      saved={search.saved === "1"}
      feedbackInsights={feedbackInsights}
    />
  );
}
