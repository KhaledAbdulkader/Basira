// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createBusinessSchema,
  updateBusinessSchema,
  timezoneSchema,
} from "@/lib/validation/business";
import {
  resolveSelectedBusiness,
  type BusinessProfile,
} from "@/lib/business/constants";

const input = {
  name: "  My store  ",
  businessType: "RETAIL",
  currency: "SAR",
  timezone: "Asia/Riyadh",
  location: "  ",
};

describe("business profile validation and selection", () => {
  it("normalizes optional fields and rejects owner/lock/version injection", () => {
    expect(createBusinessSchema.parse(input)).toMatchObject({
      name: "My store",
      location: null,
      otherBusinessType: null,
    });
    for (const extra of [
      { ownerId: "someone" },
      { financialSettingsLockedAt: new Date().toISOString() },
      { version: 1 },
    ]) {
      expect(
        createBusinessSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
    }
  });
  it("requires a bounded name and a real currency/timezone", () => {
    for (const change of [
      { name: " " },
      { name: "Cannot\nconfirm" },
      { name: "x".repeat(121) },
      { currency: "ZZZ" },
      { currency: "sar" },
      { timezone: "+03:00" },
      { timezone: "Moon/Base" },
      { businessType: "BANK" },
    ]) {
      expect(
        createBusinessSchema.safeParse({ ...input, ...change }).success,
      ).toBe(false);
    }
    expect(timezoneSchema.parse("UTC")).toBe("UTC");
    expect(timezoneSchema.parse("America/New_York")).toBe("America/New_York");
  });
  it("requires custom text only for Other and a version for edits", () => {
    expect(
      createBusinessSchema.safeParse({ ...input, businessType: "OTHER" })
        .success,
    ).toBe(false);
    expect(
      createBusinessSchema.safeParse({ ...input, otherBusinessType: "Bakery" })
        .success,
    ).toBe(false);
    expect(
      createBusinessSchema.parse({
        ...input,
        businessType: "OTHER",
        otherBusinessType: " Bakery ",
      }).otherBusinessType,
    ).toBe("Bakery");
    expect(updateBusinessSchema.safeParse(input).success).toBe(false);
    expect(
      updateBusinessSchema.safeParse({ ...input, version: -1 }).success,
    ).toBe(false);
  });
  it("accepts only an owned selection, with deterministic stale-cookie fallback", () => {
    const one = {
      ...createBusinessSchema.parse(input),
      id: "one",
      version: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      financialSettingsLockedAt: null,
    } satisfies BusinessProfile;
    const two = { ...one, id: "two" };
    expect(resolveSelectedBusiness([one, two], "two")?.id).toBe("two");
    expect(
      resolveSelectedBusiness([one, two], "someone-elses-business")?.id,
    ).toBe("one");
    expect(resolveSelectedBusiness([], "one")).toBeNull();
  });
});
