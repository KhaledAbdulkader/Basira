import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { readBusinessMutation } from "@/lib/business/http";
import { privateJson, readQuery } from "@/lib/http/request";
import { listRecords, saveRecord } from "@/lib/records/service";
import { readResource, recordFailure } from "@/lib/records/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ businessId: string; resource: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, resource } = await params;
    return privateJson(
      await listRecords(
        getDatabase(),
        user.id,
        businessId,
        readResource(resource),
        readQuery(request),
      ),
    );
  } catch (error) {
    return recordFailure(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const { businessId, resource } = await params;
    const input = await readBusinessMutation(request);
    return privateJson(
      {
        record: await saveRecord(
          getDatabase(),
          user.id,
          businessId,
          readResource(resource),
          input,
        ),
      },
      201,
    );
  } catch (error) {
    return recordFailure(error);
  }
}
