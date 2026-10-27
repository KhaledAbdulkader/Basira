export const RECORD_RESOURCES = [
  "products",
  "sales",
  "expense-categories",
  "expenses",
  "customer-metrics",
  "feedback",
] as const;
export type RecordResource = (typeof RECORD_RESOURCES)[number];
export type RecordValue = string | number | boolean | null;
export type RecordView = { id: string; version: number } & Record<
  string,
  RecordValue
>;
export type RecordList = {
  records: RecordView[];
  total: number;
  page: number;
  pageSize: number;
};
export type RecordOptions = {
  products: {
    id: string;
    name: string;
    active: boolean;
    sellingPrice: string;
    costPrice: string | null;
  }[];
  categories: { id: string; name: string; classification: string }[];
  productCategories: string[];
};
export const CLASSIFICATIONS = [
  { value: "OPERATING", label: "Operating expense" },
  { value: "INVENTORY_PURCHASE", label: "Inventory purchase" },
  { value: "OTHER", label: "Other / unclassified" },
] as const;
export function classificationLabel(value: RecordValue) {
  return (
    CLASSIFICATIONS.find((item) => item.value === value)?.label ??
    String(value ?? "")
  );
}
export const RECORD_LABELS: Record<
  RecordResource,
  { title: string; singular: string; description: string; dateField?: string }
> = {
  products: {
    title: "Products & services",
    singular: "product or service",
    description:
      "Keep your catalog and current prices together. Archive items you no longer sell.",
  },
  sales: {
    title: "Sales",
    singular: "sale",
    description:
      "Record one complete transaction for one product or service. Each sale keeps its historical cost.",
    dateField: "saleDate",
  },
  "expense-categories": {
    title: "Expense categories",
    singular: "category",
    description:
      "Separate operating expenses from inventory purchases and unclassified spending.",
  },
  expenses: {
    title: "Expenses",
    singular: "expense",
    description:
      "Record business spending with a category and date. Inventory purchases stay separate from operating expenses.",
    dateField: "expenseDate",
  },
  "customer-metrics": {
    title: "Customer metrics",
    singular: "daily count",
    description:
      "One customer-visit total per date, including repeat visits. Edit an existing day to correct it.",
    dateField: "metricDate",
  },
  feedback: {
    title: "Customer feedback",
    singular: "feedback entry",
    description:
      "Capture customer comments without names or contact details. Analyze their sentiment and topics to spot recurring feedback.",
    dateField: "feedbackDate",
  },
};
