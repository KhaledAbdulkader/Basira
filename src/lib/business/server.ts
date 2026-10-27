import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { requirePageUser } from "@/lib/auth/server";
import {
  BusinessError,
  businessProfile,
  getOwnedBusiness,
  listBusinesses,
} from "@/lib/business/service";
import {
  resolveSelectedBusiness,
  SELECTED_BUSINESS_COOKIE,
} from "@/lib/business/constants";
import { businessIdSchema } from "@/lib/validation/business";

export const getWorkspaceBusinesses = cache(async () => {
  const user = await requirePageUser();
  const businesses = await listBusinesses(getDatabase(), user.id);
  const selectedId = (await cookies()).get(SELECTED_BUSINESS_COOKIE)?.value;
  return {
    businesses,
    selectedBusiness: resolveSelectedBusiness(businesses, selectedId),
  };
});

export async function getBusinessForPage(id: string) {
  const user = await requirePageUser();
  if (!businessIdSchema.safeParse(id).success) notFound();
  try {
    return businessProfile(await getOwnedBusiness(getDatabase(), user.id, id));
  } catch (error) {
    if (error instanceof BusinessError && error.status === 404) notFound();
    throw error;
  }
}
