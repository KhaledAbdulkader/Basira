export const BUSINESS_TYPES = [
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "CAFE", label: "Cafe" },
  { value: "RETAIL", label: "Retail" },
  { value: "E_COMMERCE", label: "E-commerce" },
  { value: "SERVICE_PROVIDER", label: "Service Provider" },
  { value: "STARTUP", label: "Startup" },
  { value: "PROFESSIONAL_SERVICES", label: "Professional Services" },
  { value: "OTHER", label: "Other" },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPES)[number]["value"];
export const SELECTED_BUSINESS_COOKIE = "basira-business";

export function businessTypeLabel(
  type: BusinessTypeValue,
  other: string | null,
) {
  return type === "OTHER" && other
    ? other
    : (BUSINESS_TYPES.find((item) => item.value === type)?.label ?? type);
}

export type BusinessProfile = {
  id: string;
  name: string;
  businessType: BusinessTypeValue;
  otherBusinessType: string | null;
  location: string | null;
  currency: string;
  timezone: string;
  financialSettingsLockedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

// The incoming preference is untrusted; only use records already scoped to owner.
export function resolveSelectedBusiness(
  businesses: BusinessProfile[],
  selectedId?: string,
) {
  return (
    businesses.find((business) => business.id === selectedId) ??
    businesses[0] ??
    null
  );
}
