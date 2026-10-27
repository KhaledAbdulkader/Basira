import Link from "next/link";
import { getBusinessForPage } from "@/lib/business/server";
import { requirePageUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { listAlertRules } from "@/lib/alerts/service";
import {
  ALERT_WINDOW_DAYS,
  MIN_ANALYZED_FEEDBACK,
} from "@/lib/alerts/contracts";
import { RuleEditor } from "@/components/alerts/rule-editor";
export const metadata = { title: "Alert settings" };
export default async function AlertSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requirePageUser(),
    business = await getBusinessForPage((await params).businessId);
  const rules = await listAlertRules(getDatabase(), user.id, business.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/businesses/${business.id}`}
        className="text-sm text-primary underline"
      >
        Business settings
      </Link>
      <header>
        <p className="text-sm text-primary">{business.name}</p>
        <h1 className="mt-1 text-3xl font-semibold">Alert settings</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Rules use the latest {ALERT_WINDOW_DAYS} completed days in{" "}
          {business.timezone}. Changes apply immediately; existing alerts retain
          their original thresholds and evidence. All alerts stay inside Basira.
        </p>
      </header>
      <p className="rounded-xl border bg-card p-4 text-sm leading-6">
        Negative-feedback checks need {MIN_ANALYZED_FEEDBACK} analyzed comments.
        Profit-margin checks require complete historical cost coverage. Forecast
        checks compare daily averages using the latest saved revenue forecast
        with history through yesterday and up to 30 saved baseline days.
      </p>
      {rules.map((rule) => (
        <RuleEditor
          key={`${rule.id}:${rule.version}`}
          businessId={business.id}
          rule={rule}
        />
      ))}
    </div>
  );
}
