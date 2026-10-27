import { Prisma } from "@/generated/prisma/client";
import { readAuthOrigin } from "@/lib/auth/environment";
import { businessFailure } from "@/lib/business/http";
import { requireSameOrigin, privateJson } from "@/lib/http/request";
import { IMPORT_LIMITS } from "./constants";
import { ImportError } from "./errors";
import { importTypeSchema } from "./validation";

export async function readImportUpload(request: Request, confirm = false) {
  requireSameOrigin(request, readAuthOrigin());
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;/i.test(contentType))
    throw new ImportError(415, "Upload a file using the import form.");
  const max = IMPORT_LIMITS.requestBytes;
  if (Number(request.headers.get("content-length")) > max)
    throw new ImportError(413, "Choose a file no larger than 2 MiB.");
  const reader = request.body?.getReader();
  if (!reader) throw new ImportError(400, "Choose a file to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        throw new ImportError(413, "Choose a file no larger than 2 MiB.");
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof ImportError) throw error;
    throw new ImportError(
      400,
      "The upload was interrupted. Choose your file again.",
    );
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new ImportError(
      400,
      "The upload could not be read. Choose your file again.",
    );
  }
  const keys = confirm
    ? ["file", "importType", "token", "confirmed"]
    : ["file", "importType"];
  if (
    [...form.keys()].some((key) => !keys.includes(key)) ||
    keys.some((key) => form.getAll(key).length !== 1)
  )
    throw new ImportError(
      400,
      "Use the import form with one file and one data type.",
    );
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ImportError(400, "Choose a CSV or XLSX file.");
  if (file.size > IMPORT_LIMITS.fileBytes)
    throw new ImportError(413, "Choose a file no larger than 2 MiB.");
  const token = form.get("token");
  if (
    confirm &&
    (typeof token !== "string" ||
      token.length > 4096 ||
      form.get("confirmed") !== "true")
  )
    throw new ImportError(
      400,
      "Review the preview and explicitly confirm the import.",
    );
  return {
    file: {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    },
    importType: importTypeSchema.parse(form.get("importType")),
    token: typeof token === "string" ? token : "",
    confirmed: form.get("confirmed") === "true",
  };
}
export function importFailure(error: unknown) {
  if (error instanceof ImportError)
    return privateJson({ message: error.message }, error.status);
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2034"].includes(error.code)
  )
    return privateJson(
      {
        message:
          "Business data changed during the import. Preview again and check import history before retrying.",
      },
      409,
    );
  return businessFailure(error);
}
