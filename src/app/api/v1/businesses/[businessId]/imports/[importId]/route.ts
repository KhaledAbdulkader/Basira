import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson } from "@/lib/http/request";
import { getImport } from "@/lib/imports/service";
import { importFailure } from "@/lib/imports/http";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; importId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId, importId } = await params;
    return privateJson(
      await getImport(getDatabase(), user.id, businessId, importId),
    );
  } catch (error) {
    return importFailure(error);
  }
}
