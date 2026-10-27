import { requireUser } from "@/lib/auth/server";
import { readAuthSecret } from "@/lib/auth/environment";
import { getDatabase } from "@/lib/db/client";
import { getOwnedBusiness } from "@/lib/business/service";
import { privateJson } from "@/lib/http/request";
import { readImportUpload, importFailure } from "@/lib/imports/http";
import { parseImportFile } from "@/lib/imports/parser";
import { previewImport } from "@/lib/imports/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    const db = getDatabase();
    await getOwnedBusiness(db, user.id, businessId);
    const input = await readImportUpload(request);
    const file = await parseImportFile(input.file, input.importType);
    const result = await previewImport(
      db,
      user.id,
      businessId,
      input.importType,
      file,
      readAuthSecret(),
    );
    return privateJson(result);
  } catch (error) {
    return importFailure(error);
  }
}
