import { createHash } from "node:crypto";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { Decimal } from "@/lib/records/money";
import { dateOnly } from "@/lib/records/dates";
import {
  IMPORT_DEFINITIONS,
  IMPORT_LIMITS as limits,
  type ImportType,
  type ParsedFile,
} from "./constants";
import { ImportError } from "./errors";
import { inspectWorkbook } from "./xlsx-guard";

export type ImportFile = { name: string; type: string; bytes: Uint8Array };
type Cell = { text: string; error?: string };
type GridRow = { row: number; cells: Cell[]; errors: string[] };
const headerName = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const fail = (message: string): never => {
  throw new ImportError(422, message);
};

function csvRows(bytes: Uint8Array): GridRow[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("Save CSV files as UTF-8 text before uploading.");
  }
  if (text.includes("\u0000"))
    return fail("The CSV contains binary data. Save it as UTF-8 CSV.");
  const rows: GridRow[] = [];
  let recordNumber = 0;
  Papa.parse<string[]>(text, {
    delimiter: ",",
    dynamicTyping: false,
    skipEmptyLines: false,
    step(result, parser) {
      recordNumber++;
      if (result.errors.length) {
        parser.abort();
        fail("The CSV has malformed quoting. Correct it before previewing.");
      }
      if (recordNumber > 1 && result.data.every((value) => !value.trim()))
        return;
      if (result.data.length > limits.columns) {
        parser.abort();
        throw new ImportError(413, `Use at most ${limits.columns} columns.`);
      }
      if (rows.length > limits.rows) {
        parser.abort();
        throw new ImportError(413, `Use at most ${limits.rows} data rows.`);
      }
      rows.push({
        row: recordNumber,
        cells: result.data.map((value) => ({ text: value })),
        errors: [],
      });
    },
  });
  // A final newline produces an empty parser record; it is not an extra data row.
  while (rows.length && rows.at(-1)!.cells.every((cell) => !cell.text.trim()))
    rows.pop();
  return rows;
}

function excelDate(serialText: string, date1904: boolean) {
  const serial = new Decimal(serialText);
  if (
    !serial.isInteger() ||
    serial.isNegative() ||
    serial.gt(2958465) ||
    (!date1904 && serial.eq(60))
  )
    return fail("Use a real date without a time value (YYYY-MM-DD).");
  const epoch = Date.UTC(
    date1904 ? 1904 : 1899,
    date1904 ? 0 : 11,
    date1904 ? 1 : 31,
  );
  return dateOnly(
    new Date(
      epoch +
        (serial.toNumber() - (!date1904 && serial.gt(60) ? 1 : 0)) * 86400000,
    ),
  );
}
async function xlsxRows(bytes: Uint8Array): Promise<GridRow[]> {
  try {
    const buffer = Buffer.from(bytes);
    const inspected = await inspectWorkbook(buffer);
    const workbook = new ExcelJS.Workbook();
    // ExcelJS declares its input as ArrayBuffer; use an owned buffer with no offset.
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
    if (
      workbook.worksheets.length !== 1 ||
      workbook.worksheets[0]!.state !== "visible"
    )
      return fail("Use exactly one visible worksheet per import.");
    const sheet = workbook.worksheets[0]!;
    if (sheet.rowCount > limits.rows + 1 || sheet.columnCount > limits.columns)
      throw new ImportError(
        413,
        "The worksheet exceeds the supported row or column limits.",
      );
    const rows: GridRow[] = [];
    for (let index = 1; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);
      const cells: Cell[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let result: Cell;
        if (value === null || value === undefined) result = { text: "" };
        else if (cell.isMerged)
          result = { text: "", error: "Unmerge cells before importing." };
        else if (cell.type === ExcelJS.ValueType.Formula)
          result = {
            text: "",
            error: "Replace formulas with plain values before importing.",
          };
        else if (value instanceof Date) {
          try {
            const raw = inspected.numeric.get(cell.address);
            if (raw === undefined && value.getTime() % 86400000 !== 0)
              throw new Error("Time values are unsupported.");
            result = {
              text:
                raw === undefined
                  ? dateOnly(value)
                  : excelDate(raw, inspected.date1904),
            };
          } catch {
            result = {
              text: "",
              error: "Use a real date without a time value (YYYY-MM-DD).",
            };
          }
        } else if (typeof value === "number") {
          const raw = inspected.numeric.get(cell.address);
          if (
            !raw ||
            raw.length > 80 ||
            !/^[+-]?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(raw)
          )
            result = { text: "", error: "Unsupported numeric cell." };
          else {
            const number = new Decimal(raw);
            result =
              number.isFinite() &&
              number.abs().lt("1e30") &&
              number.decimalPlaces() <= 20
                ? { text: number.toFixed() }
                : {
                    text: "",
                    error:
                      "Numeric cell exceeds the supported precision or range.",
                  };
          }
        } else if (typeof value === "string" || typeof value === "boolean")
          result = { text: String(value) };
        else if ("richText" in value)
          result = { text: value.richText.map((part) => part.text).join("") };
        else
          result = {
            text: "",
            error:
              "Use plain text, numbers or dates, without formulas or cell errors.",
          };
        cells.push(result);
      }
      rows.push({ row: index, cells, errors: [] });
    }
    return rows;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(
      422,
      "We couldn’t read this workbook. Save a plain, unprotected XLSX file and try again.",
    );
  }
}

export async function parseImportFile(
  file: ImportFile,
  type: ImportType,
): Promise<ParsedFile> {
  if (!file.bytes.length) throw new ImportError(422, "The file is empty.");
  if (file.bytes.length > limits.fileBytes)
    throw new ImportError(413, "Choose a file no larger than 2 MiB.");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx")
    throw new ImportError(
      415,
      "Choose a CSV or XLSX file. XLS and macro-enabled files are not supported.",
    );
  const allowed =
    extension === "csv"
      ? [
          "",
          "text/csv",
          "application/csv",
          "text/plain",
          "application/vnd.ms-excel",
          "application/octet-stream",
        ]
      : [
          "",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
        ];
  if (!allowed.includes(file.type.toLowerCase().split(";")[0]!))
    throw new ImportError(415, "The file type does not match its extension.");
  if (
    extension === "xlsx" &&
    (file.bytes[0] !== 0x50 || file.bytes[1] !== 0x4b)
  )
    return fail("The file does not contain an XLSX workbook.");
  const grid =
    extension === "csv" ? csvRows(file.bytes) : await xlsxRows(file.bytes);
  if (!grid.length || grid[0]!.cells.every((cell) => !cell.text.trim()))
    return fail("Put the column headings in the first row.");
  if (grid.length > limits.rows + 1)
    throw new ImportError(413, `Use at most ${limits.rows} data rows.`);
  let headerCells = grid[0]!.cells;
  // Excel formats may extend past the populated header. Only wholly empty trailing columns are ignored.
  while (
    headerCells.length &&
    !headerCells.at(-1)!.text.trim() &&
    grid.every(
      (row) =>
        !row.cells[headerCells.length - 1]?.text &&
        !row.cells[headerCells.length - 1]?.error,
    )
  )
    headerCells = headerCells.slice(0, -1);
  const headers = headerCells.map((cell) => headerName(cell.text));
  if (
    headers.length > limits.columns ||
    headers.some(
      (value, index) => !value || headers.indexOf(value) !== index,
    ) ||
    headerCells.some((cell) => cell.error)
  )
    return fail("Use unique, nonempty column headings from the template.");
  const definition = IMPORT_DEFINITIONS[type];
  const missing = definition.required.filter(
    (column) => !headers.includes(column),
  );
  if (missing.length)
    return fail(
      `Missing required column: ${missing.join(", ")}. Download the matching template.`,
    );
  if (
    headers.some(
      (header) => !(definition.columns as readonly string[]).includes(header),
    )
  )
    return fail(
      "The file contains unexpected columns. Use the matching template headings.",
    );
  const rows = grid
    .slice(1)
    .filter((row) => row.cells.some((cell) => cell.text.trim() || cell.error))
    .map((row) => {
      const errors = [...row.errors];
      if (
        row.cells
          .slice(headers.length)
          .some((cell) => cell.text.trim() || cell.error)
      )
        errors.push("This row has more values than column headings.");
      const values: Record<string, string> = {};
      for (const [index, header] of headers.entries()) {
        const cell = row.cells[index] ?? { text: "" };
        values[header] = cell.text.trim().slice(0, limits.cellCharacters);
        if (cell.text.length > limits.cellCharacters)
          errors.push(`${header}: cell text is too long.`);
        if (cell.error) errors.push(`${header}: ${cell.error}`);
      }
      return { row: row.row, values, errors };
    });
  if (!rows.length)
    return fail("Add at least one data row below the headings.");
  return {
    fileName: file.name
      .replaceAll("\\", "/")
      .split("/")
      .at(-1)!
      .split("")
      .filter(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      )
      .join("")
      .slice(0, 180),
    fileType: extension === "csv" ? "CSV" : "XLSX",
    fileHash: createHash("sha256").update(file.bytes).digest("hex"),
    rows,
    headers,
  };
}
