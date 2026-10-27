// @vitest-environment node
import { expect, test } from "vitest";
import { csv, workbookFile, changeWorkbook } from "../helpers/imports";
import { parseImportFile } from "@/lib/imports/parser";
import {
  validateImportRows,
  type ImportContext,
} from "@/lib/imports/validation";
import { importTemplate } from "@/lib/imports/templates";
import {
  IMPORT_TYPES,
  IMPORT_DEFINITIONS,
  IMPORT_LIMITS,
} from "@/lib/imports/constants";
import { signPreview, verifyPreview, reviewHash } from "@/lib/imports/token";
import { inspectWorkbook } from "@/lib/imports/xlsx-guard";

const context: ImportContext = {
  currency: "SAR",
  products: [{ id: "clatte00000000000000000001", name: "Latte", active: true }],
  categories: [
    {
      id: "crent000000000000000000001",
      name: "Rent",
      classification: "OPERATING",
    },
    {
      id: "cstock00000000000000000001",
      name: "Inventory",
      classification: "INVENTORY_PURCHASE",
    },
  ],
  customerDates: ["2026-09-20"],
};
test("CSV preserves decimal strings, quoted commas/multiline feedback and logical row numbers", async () => {
  const file = await csv(
    '\uFEFF Date , Feedback Text\r\n2026-09-20,"Great, coffee\nand staff"\r\n\r\n2026-09-21,More\r\n',
    "FEEDBACK",
  );
  expect(file.headers).toEqual(["date", "feedback_text"]);
  expect(file.rows.map((row) => row.row)).toEqual([2, 4]);
  expect(file.rows[0]!.values.feedback_text).toBe("Great, coffee\nand staff");
  expect(
    validateImportRows(file, "FEEDBACK", context).every(
      (row) => !row.errors.length,
    ),
  ).toBe(true);
});
test.each([
  ["date,amount\n2026-09-20,1", "Missing required column"],
  ["date,feedback_text,owner_id\n2026-09-20,Fine,x", "unexpected columns"],
  ["date,date,feedback_text\n2026-09-20,2026-09-20,Fine", "unique"],
  ['date,feedback_text\n2026-09-20,"Unclosed', "quoting"],
  ["date,feedback_text\n", "at least one data row"],
])("CSV rejects invalid structure: %s", async (text, message) => {
  await expect(csv(text, "FEEDBACK")).rejects.toThrow(message);
});
test("CSV enforces actual size, encoding, row/column counts and flags extra values", async () => {
  await expect(
    parseImportFile(
      { name: "bad.csv", type: "text/csv", bytes: new Uint8Array([0xff]) },
      "FEEDBACK",
    ),
  ).rejects.toThrow("UTF-8");
  await expect(
    csv("x".repeat(IMPORT_LIMITS.fileBytes + 1), "FEEDBACK"),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    csv("date,feedback_text\n" + "2026-09-20,Fine\n".repeat(1001), "FEEDBACK"),
  ).rejects.toMatchObject({ status: 413 });
  expect(
    (
      await csv(
        "date,feedback_text\n" + "2026-09-20,Fine\n".repeat(1000),
        "FEEDBACK",
      )
    ).rows,
  ).toHaveLength(1000);
  await expect(
    csv(new Array(13).fill("x").join(","), "FEEDBACK"),
  ).rejects.toMatchObject({ status: 413 });
  expect(
    (
      await csv("date,feedback_text\n2026-09-20,Fine,extra", "FEEDBACK")
    ).rows[0]!.errors.join(),
  ).toContain("more values");
  expect(
    validateImportRows(
      await csv(
        "date,feedback_text\n2026-09-20," + "a".repeat(4001),
        "FEEDBACK",
      ),
      "FEEDBACK",
      context,
    )[0]!.errors.length,
  ).toBeGreaterThan(0);
});
test("sales use unique active matches, exact totals and explicit historical cost coverage", async () => {
  const file = await csv(
    "date,item_name,quantity,unit_price,unit_cost,total_amount\n2026-09-20, latte ,3,0.1,,0.30\n2026-09-20,Latte,1,0.105,0,0.11\n2026-09-20,Latte,1,1,1,2\n2026-09-20,Unknown,1,1,,",
    "SALES",
  );
  const rows = validateImportRows(file, "SALES", context);
  expect(rows[0]!.resolved).toMatchObject({
    itemName: "Latte",
    unitCost: null,
    totalAmount: "0.3",
  });
  expect(rows[0]!.warnings.join()).toContain("unknown");
  expect(rows[1]!.resolved).toMatchObject({
    unitCost: "0",
    totalAmount: "0.11",
  });
  expect(rows[1]!.warnings).toEqual([]);
  expect(rows[2]!.errors.join()).toContain("total_amount");
  expect(rows[3]!.errors.join()).toContain("no matching");
  expect(
    validateImportRows(file, "SALES", {
      ...context,
      products: [
        ...context.products,
        { ...context.products[0]!, id: "cother00000000000000000001" },
      ],
    })[0]!.errors.join(),
  ).toContain("multiple active");
  expect(
    validateImportRows(file, "SALES", {
      ...context,
      products: [{ ...context.products[0]!, active: false }],
    })[0]!.resolved,
  ).toBeNull();
});
test("products reject duplicate or existing names, including archived catalog entries", async () => {
  const rows = validateImportRows(
    await csv(
      "item_name,type,selling_price,cost_price\nLatte,PRODUCT,10,\nTea,SERVICE,4,0\n tea ,product,5,2\nNew,SERVICE,0,",
      "PRODUCTS",
    ),
    "PRODUCTS",
    { ...context, products: [{ ...context.products[0]!, active: false }] },
  );
  expect(rows.slice(0, 3).every((row) => row.errors.length)).toBe(true);
  expect(rows[3]!.resolved).toMatchObject({
    costPrice: null,
    sellingPrice: "0",
    type: "SERVICE",
  });
});
test("expenses require known classifications and currency precision, and disallow negatives", async () => {
  const rows = validateImportRows(
    await csv(
      "date,category,amount\n2026-09-20, rent ,10.00\n2026-09-20,INVENTORY,25\n2026-09-20,Unknown,5\n2026-09-20,Rent,0.001\n2026-09-20,Rent,-1",
      "EXPENSES",
    ),
    "EXPENSES",
    context,
  );
  expect(rows[0]!.resolved).toMatchObject({ classification: "OPERATING" });
  expect(rows[1]!.warnings.join()).toContain("excluded");
  expect(rows.slice(2).every((row) => row.resolved === null)).toBe(true);
});
test("daily visits reject existing/repeated dates, ambiguous dates, negative/fractional counts", async () => {
  const rows = validateImportRows(
    await csv(
      "date,customer_count\n2026-09-20,2\n2026-09-21,3\n2026-09-21,4\n2026-09-22,0\n2026-09-23,1.5\n2026-02-30,3\n09/24/2026,3\n2026-09-25,-1",
      "CUSTOMER_METRICS",
    ),
    "CUSTOMER_METRICS",
    context,
  );
  expect(rows.filter((row) => row.resolved)).toHaveLength(1);
  expect(rows[3]!.resolved).toMatchObject({ customerCount: 0 });
});
test("identical transaction rows are warned about without silently deleting legitimate transactions", async () => {
  const rows = validateImportRows(
    await csv(
      "date,feedback_text\n2026-09-20,Good\n2026-09-20,Good",
      "FEEDBACK",
    ),
    "FEEDBACK",
    context,
  );
  expect(rows.every((row) => row.resolved)).toBe(true);
  expect(rows[1]!.warnings.join()).toContain("Identical to row 2");
});
test.each(IMPORT_TYPES)(
  "both %s templates contain only expected headings and support populated XLSX roundtrip",
  async (type) => {
    const csvTemplate = await importTemplate(type, "csv");
    expect(
      csvTemplate.bytes
        .toString()
        .replace(/^\uFEFF/, "")
        .trim(),
    ).toBe(IMPORT_DEFINITIONS[type].columns.join(","));
    const template = await importTemplate(type, "xlsx");
    // Read using ExcelJS to fill the real downloaded template before parsing it.
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(template.bytes).buffer);
    expect(workbook.worksheets[0]!.rowCount).toBe(1);
    workbook.worksheets[0]!.addRow([...IMPORT_DEFINITIONS[type].example]);
    const parsed = await parseImportFile(
      {
        name: "filled.xlsx",
        type: template.contentType,
        bytes: new Uint8Array(await workbook.xlsx.writeBuffer()),
      },
      type,
    );
    expect(parsed.headers).toEqual(IMPORT_DEFINITIONS[type].columns);
    expect(parsed.rows).toHaveLength(1);
  },
);
test.each([false, true])(
  "XLSX numeric cells and Excel dates are normalized (1904=%s)",
  async (date1904) => {
    const file = await workbookFile(
      [
        ["date", "customer_count"],
        [new Date("2026-09-21T00:00:00Z"), 12],
      ],
      (book) => {
        book.properties.date1904 = date1904;
        book.worksheets[0]!.getCell("A2").numFmt = "yyyy-mm-dd";
      },
    );
    expect(
      (await parseImportFile(file, "CUSTOMER_METRICS")).rows[0]!.values,
    ).toEqual({ date: "2026-09-21", customer_count: "12" });
  },
);
test("XLSX reads numeric lexical values without binary float loss", async () => {
  const file = await workbookFile([
    ["item_name", "type", "selling_price"],
    ["Tea", "PRODUCT", 1],
  ]);
  file.bytes = await changeWorkbook(file.bytes, {
    "xl/worksheets/sheet1.xml": (xml) =>
      xml.replace(
        '<c r="C2"><v>1</v></c>',
        '<c r="C2"><v>999999999999.1234</v></c>',
      ),
  });
  expect(
    (await parseImportFile(file, "PRODUCTS")).rows[0]!.values.selling_price,
  ).toBe("999999999999.1234");
});
test("XLSX formulas are invalid rows and Excel time values are not silently truncated", async () => {
  const file = await workbookFile(
    [
      ["date", "customer_count"],
      ["2026-09-21", { formula: "1+1", result: 2 }],
      [new Date("2026-09-22T12:00:00Z"), 4],
    ],
    (book) => {
      book.worksheets[0]!.getCell("A3").numFmt = "yyyy-mm-dd";
    },
  );
  const rows = (await parseImportFile(file, "CUSTOMER_METRICS")).rows;
  expect(rows[0]!.errors.join()).toContain("formulas");
  expect(rows[1]!.errors.join()).toContain("without a time");
});
test.each([
  ["mergeCells", '<mergeCells><mergeCell ref="A1:XFD1048576"/></mergeCells>'],
  [
    "dataValidations",
    '<dataValidations><dataValidation sqref="A1:XFD1048576"/></dataValidations>',
  ],
  ["conditionalFormatting", '<conditionalFormatting sqref="A1:XFD1048576"/>'],
])(
  "XLSX rejects expanding %s ranges before loading",
  async (_name, fragment) => {
    const file = await workbookFile([
      ["date", "feedback_text"],
      ["2026-09-20", "Good"],
    ]);
    file.bytes = await changeWorkbook(file.bytes, {
      "xl/worksheets/sheet1.xml": (xml) =>
        xml.replace("</worksheet>", fragment + "</worksheet>"),
    });
    await expect(parseImportFile(file, "FEEDBACK")).rejects.toMatchObject({
      status: 422,
    });
  },
);
test("XLSX rejects named ranges, external links, multiple sheets, excessive expansion and row references", async () => {
  const plain = await workbookFile([
    ["date", "feedback_text"],
    ["2026-09-20", "Good"],
  ]);
  for (const changes of [
    {
      "xl/workbook.xml": (xml: string) =>
        xml.replace(
          "</workbook>",
          '<definedNames><definedName name="wide">Import!$A$1:$XFD$1048576</definedName></definedNames></workbook>',
        ),
    },
    {
      "xl/worksheets/sheet1.xml": (xml: string) =>
        xml.replace('r="2"', 'r="1048576"'),
    },
    {
      "xl/worksheets/sheet1.xml": (xml: string) =>
        xml.replace(
          "</worksheet>",
          "<!--" + "x".repeat(4 * 1024 * 1024) + "--></worksheet>",
        ),
    },
    {
      "xl/workbook.xml": (xml: string) =>
        xml.replace(
          "<workbook ",
          '<!DOCTYPE workbook [<!ENTITY x "bad">]><workbook ',
        ),
    },
  ])
    await expect(
      parseImportFile(
        { ...plain, bytes: await changeWorkbook(plain.bytes, changes) },
        "FEEDBACK",
      ),
    ).rejects.toThrow();
  const linked = await workbookFile([
    ["date", "feedback_text"],
    ["2026-09-20", { text: "Good", hyperlink: "https://example.com" }],
  ]);
  await expect(parseImportFile(linked, "FEEDBACK")).rejects.toThrow("external");
  const sheets = await workbookFile([["date", "feedback_text"]], (book) => {
    book.addWorksheet("Other");
  });
  await expect(parseImportFile(sheets, "FEEDBACK")).rejects.toThrow(
    "one worksheet",
  );
});
test("preview signatures reject token edits, wrong secrets and oversized input", () => {
  const claims = {
    version: 1 as const,
    actorId: "owner",
    businessId: "business",
    importType: "SALES" as const,
    fileHash: reviewHash("file"),
    reviewHash: reviewHash("review"),
    expires: 123456,
  };
  const token = signPreview(claims, "test secret");
  expect(verifyPreview(token, "test secret")).toEqual(claims);
  for (const invalid of [
    token.replace(/^./, "x"),
    token + "a",
    "a".repeat(4097),
  ])
    expect(() => verifyPreview(invalid, "test secret")).toThrow("invalid");
  expect(() => verifyPreview(token, "another secret")).toThrow("invalid");
});

test.each([
  'min="1000000000" max="1"',
  'min="0" max="1"',
  'min="-1" max="1"',
  'min="1.5" max="2"',
  'max="1"',
  'min="1" max="13"',
])(
  "XLSX rejects unsafe column bounds before workbook allocation: %s",
  async (bounds) => {
    const file = await workbookFile([
      ["date", "feedback_text"],
      ["2026-09-20", "Good"],
    ]);
    const bytes = await changeWorkbook(file.bytes, {
      "xl/worksheets/sheet1.xml": (xml) =>
        xml.replace(
          "<sheetData>",
          `<cols><col ${bounds} width="12"/></cols><sheetData>`,
        ),
    });
    // Call the preflight directly: a regression must fail safely, never ask
    // ExcelJS to allocate the attacker-declared billion-column range.
    await expect(inspectWorkbook(bytes)).rejects.toMatchObject({ status: 413 });
  },
);

test.each([
  '<row r="2"><c r="A1"><v>1</v></c></row>',
  '<row r="2"><c r="M2"><v>1</v></c></row>',
  '<row r="2"><c r="A1002"><v>1</v></c></row>',
])("XLSX rejects duplicate/out-of-bounds cell references", async (fragment) => {
  const file = await workbookFile([
    ["date", "feedback_text"],
    ["2026-09-20", "Good"],
  ]);
  const bytes = await changeWorkbook(file.bytes, {
    "xl/worksheets/sheet1.xml": (xml) =>
      xml.replace("</sheetData>", fragment + "</sheetData>"),
  });
  await expect(inspectWorkbook(bytes)).rejects.toThrow();
});
