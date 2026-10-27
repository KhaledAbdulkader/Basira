import ExcelJS from "exceljs";
import { IMPORT_DEFINITIONS, type ImportType } from "./constants";

export async function importTemplate(type: ImportType, format: "csv" | "xlsx") {
  const columns = [...IMPORT_DEFINITIONS[type].columns];
  if (format === "csv")
    return {
      bytes: Buffer.from("\uFEFF" + columns.join(",") + "\r\n"),
      contentType: "text/csv; charset=utf-8",
    };
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((header) => ({
    header,
    key: header,
    width: Math.max(20, header.length + 4),
    style: { numFmt: "@" },
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF245C52" },
    };
  });
  return {
    bytes: Buffer.from(await workbook.xlsx.writeBuffer()),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
