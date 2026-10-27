import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { readBusinessMutation } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { deleteRecord, getRecord, saveRecord } from "@/lib/records/service";
import { readResource, recordFailure } from "@/lib/records/http";

export const dynamic = "force-dynamic";
type Context = {
  params: Promise<{ businessId: string; resource: string; recordId: string }>;
};
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, resource, recordId } = await params;
    return privateJson({
      record: await getRecord(
        getDatabase(),
        user.id,
        businessId,
        readResource(resource),
        recordId,
      ),
    });
  } catch (error) {
    return recordFailure(error);
  }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, resource, recordId } = await params;
    return privateJson({
      record: await saveRecord(
        getDatabase(),
        user.id,
        businessId,
        readResource(resource),
        await readBusinessMutation(request),
        recordId,
      ),
    });
  } catch (error) {
    return recordFailure(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, resource, recordId } = await params;
    await deleteRecord(
      getDatabase(),
      user.id,
      businessId,
      readResource(resource),
      recordId,
      await readBusinessMutation(request),
    );
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return recordFailure(error);
  }
}
