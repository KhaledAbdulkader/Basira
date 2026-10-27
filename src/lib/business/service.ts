import type { Business, Prisma, PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "@/lib/auth/access";
import {
  businessIdSchema,
  createBusinessSchema,
  updateBusinessSchema,
  deleteBusinessSchema,
} from "@/lib/validation/business";
import type { BusinessProfile } from "@/lib/business/constants";
import { createDefaultCategories } from "@/lib/records/defaults";
import { createDefaultAlertRules } from "@/lib/alerts/defaults";

type Database = PrismaClient | Prisma.TransactionClient;
export class BusinessError extends Error {
  constructor(
    public readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export function businessProfile(business: Business): BusinessProfile {
  return {
    id: business.id,
    name: business.name,
    businessType: business.businessType,
    otherBusinessType: business.otherBusinessType,
    location: business.location,
    currency: business.currency,
    timezone: business.timezone,
    version: business.version,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
    financialSettingsLockedAt:
      business.financialSettingsLockedAt?.toISOString() ?? null,
  };
}

async function requireActiveActor(db: Database, actorId: string) {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { status: true },
  });
  if (!actor) throw new AccessError(401);
  if (actor.status !== "ACTIVE") throw new AccessError(403);
}

export async function listBusinesses(db: Database, actorId: string) {
  await requireActiveActor(db, actorId);
  const businesses = await db.business.findMany({
    where: { ownerId: actorId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return businesses.map(businessProfile);
}

export async function getOwnedBusiness(
  db: Database,
  actorId: string,
  businessId: string,
) {
  await requireActiveActor(db, actorId);
  const business = await db.business.findFirst({
    where: { id: businessIdSchema.parse(businessId), ownerId: actorId },
  });
  if (!business) throw new BusinessError(404, "Business not found.");
  return business;
}

// All profile mutations and future financial writes lock the same business row.
export async function lockOwnedBusiness(
  tx: Prisma.TransactionClient,
  actorId: string,
  businessId: string,
) {
  await requireActiveActor(tx, actorId);
  const id = businessIdSchema.parse(businessId);
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Business" WHERE "id" = ${id} AND "ownerId" = ${actorId} FOR UPDATE`;
  if (!rows.length) throw new BusinessError(404, "Business not found.");
  return getOwnedBusiness(tx, actorId, id);
}

export async function createBusiness(
  db: PrismaClient,
  actorId: string,
  input: unknown,
) {
  const data = createBusinessSchema.parse(input);
  return db.$transaction(async (tx) => {
    await requireActiveActor(tx, actorId);
    const business = await tx.business.create({
      data: { ...data, ownerId: actorId },
    });
    await createDefaultCategories(tx, business.id);
    await createDefaultAlertRules(tx, business.id);
    return businessProfile(business);
  });
}

export async function updateBusiness(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
) {
  const { version, ...data } = updateBusinessSchema.parse(input);
  return db.$transaction(async (tx) => {
    const current = await lockOwnedBusiness(tx, actorId, businessId);
    if (current.version !== version)
      throw new BusinessError(
        409,
        "This business changed in another window. Reload before saving.",
      );
    if (
      current.financialSettingsLockedAt &&
      (data.currency !== current.currency || data.timezone !== current.timezone)
    ) {
      throw new BusinessError(
        409,
        "Currency and timezone cannot change after financial records have been added.",
      );
    }
    return businessProfile(
      await tx.business.update({
        where: { id: current.id },
        data: { ...data, version: { increment: 1 } },
      }),
    );
  });
}

export async function deleteBusiness(
  db: PrismaClient,
  actorId: string,
  businessId: string,
  input: unknown,
) {
  const data = deleteBusinessSchema.parse(input);
  return db.$transaction(async (tx) => {
    const current = await lockOwnedBusiness(tx, actorId, businessId);
    if (current.version !== data.version)
      throw new BusinessError(
        409,
        "This business changed. Reload and confirm its current name.",
      );
    if (current.name !== data.confirmationName)
      throw new BusinessError(
        422,
        "Type the business name exactly to confirm deletion.",
      );
    await tx.business.delete({ where: { id: current.id } });
  });
}

// Call inside the SAME transaction as a future financial insert, before reading
// its currency/timezone or writing amounts. Rollback undoes both marker and data.
// No financial endpoints or records are introduced in Phase 3.
export async function lockFinancialSettings(
  tx: Prisma.TransactionClient,
  actorId: string,
  businessId: string,
) {
  const business = await lockOwnedBusiness(tx, actorId, businessId);
  if (business.financialSettingsLockedAt) return business;
  return tx.business.update({
    where: { id: business.id },
    data: { financialSettingsLockedAt: new Date(), version: { increment: 1 } },
  });
}
