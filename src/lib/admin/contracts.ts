import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/business/constants";
import { businessIdSchema } from "@/lib/validation/business";
import { readQuery } from "@/lib/http/request";

const filters = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  q: z
    .string()
    .trim()
    .max(120)
    .refine(
      (value) =>
        [...value].every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      "Use a single-line search.",
    )
    .default(""),
};
export const adminUsersQuery = z
  .object({
    ...filters,
    status: z.enum(["ALL", "ACTIVE", "SUSPENDED"]).default("ALL"),
    role: z.enum(["ALL", "USER", "ADMIN"]).default("ALL"),
  })
  .strict();
export const adminBusinessesQuery = z
  .object({
    ...filters,
    type: z.enum(["ALL", ...BUSINESS_TYPES.map((t) => t.value)]).default("ALL"),
  })
  .strict();
export const adminUserId = businessIdSchema;
export const userStatusMutation = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
    version: z.number().int().positive().max(2147483647),
    confirmed: z.literal(true),
  })
  .strict();
export function adminQuery(request: Request) {
  return readQuery(request);
}
// Prisma contains uses LIKE; escape wildcard characters for literal search.
export const literalSearch = (value: string) =>
  value.replace(/[\\%_]/g, "\\$&");

export type AdminUserView = {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  statusVersion: number;
  createdAt: string;
  businessCount: number;
};
