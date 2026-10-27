import { redirect } from "next/navigation";
import { getWorkspaceBusinesses } from "@/lib/business/server";

export default async function SettingsPage() {
  const { selectedBusiness } = await getWorkspaceBusinesses();
  redirect(
    selectedBusiness ? `/businesses/${selectedBusiness.id}` : "/businesses",
  );
}
