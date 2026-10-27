import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import {
  businessProfile,
  deleteBusiness,
  getOwnedBusiness,
  updateBusiness,
} from "@/lib/business/service";
import {
  businessFailure,
  clearSelectedBusinessIfMatches,
  readBusinessMutation,
} from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ businessId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson({
      business: businessProfile(
        await getOwnedBusiness(getDatabase(), user.id, businessId),
      ),
    });
  } catch (error) {
    return businessFailure(error);
  }
}

// A complete profile replacement makes omitted fields unambiguous.
export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const input = await readBusinessMutation(request);
    const { businessId } = await params;
    return privateJson({
      business: await updateBusiness(getDatabase(), user.id, businessId, input),
    });
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const input = await readBusinessMutation(request);
    const { businessId } = await params;
    await deleteBusiness(getDatabase(), user.id, businessId, input);
    await clearSelectedBusinessIfMatches(businessId);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return businessFailure(error);
  }
}
