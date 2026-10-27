import type { Prisma } from "@/generated/prisma/client";
import { ALERT_TYPES, RULES } from "./contracts";

export async function createDefaultAlertRules(
  tx: Prisma.TransactionClient,
  businessId: string,
) {
  await tx.alertRule.createMany({
    data: ALERT_TYPES.map((type) => ({
      businessId,
      type,
      enabled: true,
      threshold: RULES[type].threshold,
    })),
    skipDuplicates: true,
  });
}
