import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { privateJson, readQuery } from "@/lib/http/request";
import { listImports } from "@/lib/imports/service";
import { importFailure } from "@/lib/imports/http";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    return privateJson(
      await listImports(
        getDatabase(),
        user.id,
        businessId,
        readQuery(request, ["page"]).page ?? 1,
      ),
    );
  } catch (error) {
    return importFailure(error);
  }
}
