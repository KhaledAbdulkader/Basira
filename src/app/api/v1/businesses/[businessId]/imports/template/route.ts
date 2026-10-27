import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { getOwnedBusiness } from "@/lib/business/service";
import { importTypeSchema } from "@/lib/imports/validation";
import { importTemplate } from "@/lib/imports/templates";
import { importFailure } from "@/lib/imports/http";
import { readQuery } from "@/lib/http/request";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireUser();
    const { businessId } = await params;
    await getOwnedBusiness(getDatabase(), user.id, businessId);
    const query = readQuery(request, ["type", "format"]);
    const type = importTypeSchema.parse(query.type);
    const format = z.enum(["csv", "xlsx"]).parse(query.format);
    const result = await importTemplate(type, format);
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="basira-${type.toLowerCase()}-template.${format}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return importFailure(error);
  }
}
