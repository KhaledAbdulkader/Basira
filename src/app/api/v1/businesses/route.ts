import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { createBusiness, listBusinesses } from "@/lib/business/service";
import {
  businessFailure,
  readBusinessMutation,
  setSelectedBusiness,
} from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return privateJson({
      businesses: await listBusinesses(getDatabase(), user.id),
    });
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readBusinessMutation(request);
    const business = await createBusiness(getDatabase(), user.id, input);
    await setSelectedBusiness(business.id);
    return privateJson({ business }, 201);
  } catch (error) {
    return businessFailure(error);
  }
}
