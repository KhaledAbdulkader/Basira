import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ImportError } from "./errors";
import { importTypeSchema } from "./validation";

const claimsSchema = z
  .object({
    version: z.literal(1),
    actorId: z.string(),
    businessId: z.string(),
    importType: importTypeSchema,
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
    expires: z.number().int(),
  })
  .strict();
export type PreviewClaims = z.infer<typeof claimsSchema>;
const signature = (value: string, secret: string) =>
  createHmac("sha256", secret).update(`basira-import-v1:${value}`).digest();
export const reviewHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function signPreview(claims: PreviewClaims, secret: string) {
  const value = Buffer.from(
    JSON.stringify(claimsSchema.parse(claims)),
  ).toString("base64url");
  return `${value}.${signature(value, secret).toString("base64url")}`;
}
export function verifyPreview(token: string, secret: string): PreviewClaims {
  try {
    if (token.length > 4096) throw new Error();
    const parts = token.split(".");
    if (
      parts.length !== 2 ||
      !/^[A-Za-z0-9_-]+$/.test(parts[0]!) ||
      !/^[A-Za-z0-9_-]+$/.test(parts[1]!)
    )
      throw new Error();
    const actual = Buffer.from(parts[1]!, "base64url");
    const expected = signature(parts[0]!, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    return claimsSchema.parse(
      JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")),
    );
  } catch {
    throw new ImportError(
      409,
      "This preview is invalid. Upload the file again to review it.",
    );
  }
}
