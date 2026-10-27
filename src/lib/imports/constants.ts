export const IMPORT_TYPES = [
  "PRODUCTS",
  "SALES",
  "EXPENSES",
  "CUSTOMER_METRICS",
  "FEEDBACK",
] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
export const IMPORT_LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  requestBytes: 2 * 1024 * 1024 + 65536,
  rows: 1000,
  columns: 12,
  cellCharacters: 4000,
  archiveEntries: 100,
  expandedBytes: 8 * 1024 * 1024,
  entryBytes: 4 * 1024 * 1024,
  previewMinutes: 15,
} as const;
export const IMPORT_DEFINITIONS = {
  PRODUCTS: {
    label: "Products & services",
    resource: "products",
    required: ["item_name", "type", "selling_price"],
    columns: ["item_name", "type", "category", "cost_price", "selling_price"],
    example: ["Latte", "PRODUCT", "Drinks", "3.25", "10.50"],
  },
  SALES: {
    label: "Sales",
    resource: "sales",
    required: ["date", "item_name", "quantity", "unit_price"],
    columns: [
      "date",
      "item_name",
      "quantity",
      "unit_price",
      "unit_cost",
      "total_amount",
      "note",
    ],
    example: [
      "2026-09-20",
      "Latte",
      "2",
      "10.50",
      "3.25",
      "21.00",
      "Counter sale",
    ],
  },
  EXPENSES: {
    label: "Expenses",
    resource: "expenses",
    required: ["date", "category", "amount"],
    columns: ["date", "category", "amount", "description"],
    example: ["2026-09-20", "Rent", "100.00", "Shop rent"],
  },
  CUSTOMER_METRICS: {
    label: "Customer visits",
    resource: "customer-metrics",
    required: ["date", "customer_count"],
    columns: ["date", "customer_count"],
    example: ["2026-09-20", "42"],
  },
  FEEDBACK: {
    label: "Customer feedback",
    resource: "feedback",
    required: ["date", "feedback_text"],
    columns: ["date", "feedback_text"],
    example: ["2026-09-20", "Friendly service and good coffee."],
  },
} as const;
export type ParsedRow = {
  row: number;
  values: Record<string, string>;
  errors: string[];
};
export type ParsedFile = {
  fileName: string;
  fileType: "CSV" | "XLSX";
  fileHash: string;
  rows: ParsedRow[];
  headers: string[];
};
export type PreviewRow = ParsedRow & {
  warnings: string[];
  resolved: Record<string, string | number | boolean | null> | null;
};
export type ImportPreview = {
  token: string;
  expiresAt: string;
  fileName: string;
  fileType: "CSV" | "XLSX";
  importType: ImportType;
  businessId: string;
  currency: string;
  timezone: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  headers: string[];
  rows: PreviewRow[];
};
export type ImportHistoryItem = {
  id: string;
  fileName: string;
  fileType: string;
  importType: ImportType;
  status: "COMPLETED" | "PARTIAL";
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdAt: string;
};
