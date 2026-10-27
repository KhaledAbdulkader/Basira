import { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/business/service";
import { businessFailure } from "@/lib/business/http";
import { privateJson } from "@/lib/http/request";
import { resourceSchema } from "./service";

export function readResource(value: string) {
  const result = resourceSchema.safeParse(value);
  if (!result.success) throw new BusinessError(404, "Page not found.");
  return result.data;
}
export function recordFailure(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return privateJson(
        {
          message:
            "That date or category name already exists in this business. Edit the existing record instead.",
        },
        409,
      );
    if (error.code === "P2003")
      return privateJson(
        {
          message:
            "This record is referenced by other records. Review those records before deleting.",
        },
        409,
      );
  }
  return businessFailure(error);
}
