import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageUser } from "@/lib/auth/server";
import { getWorkspaceBusinesses } from "@/lib/business/server";
import { getAlertSummary } from "@/lib/alerts/service";
import { getDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageUser();
  const context = await getWorkspaceBusinesses();
  const unreadAlerts = context.selectedBusiness
    ? (
        await getAlertSummary(
          getDatabase(),
          user.id,
          context.selectedBusiness.id,
        )
      ).unread
    : 0;
  return (
    <AppShell user={user} {...context} unreadAlerts={unreadAlerts}>
      {children}
    </AppShell>
  );
}
