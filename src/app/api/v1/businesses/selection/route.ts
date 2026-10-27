import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { getOwnedBusiness } from "@/lib/business/service";
import {
  businessFailure,
  readBusinessMutation,
  setSelectedBusiness,
} from "@/lib/business/http";
import { selectBusinessSchema } from "@/lib/validation/business";
import { privateJson } from "@/lib/http/request";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { businessId } = selectBusinessSchema.parse(
      await readBusinessMutation(request),
    );
    await getOwnedBusiness(getDatabase(), user.id, businessId);
    await setSelectedBusiness(businessId);
    return privateJson({ businessId });
  } catch (error) {
    return businessFailure(error);
  }
}
