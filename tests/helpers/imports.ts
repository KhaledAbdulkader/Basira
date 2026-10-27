import { deflateRawSync } from "node:zlib";
import { fromBufferPromise } from "yauzl";
import ExcelJS from "exceljs";
import { parseImportFile } from "@/lib/imports/parser";
import type { ImportType } from "@/lib/imports/constants";

export const csv = (text: string, type: ImportType, name = "records.csv") =>
  parseImportFile({ name, type: "text/csv", bytes: Buffer.from(text) }, type);
export async function workbookFile(
  rows: (string | number | Date | object | null)[][],
  setup?: (book: ExcelJS.Workbook) => void,
) {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Import").addRows(rows);
  setup?.(book);
  return {
    name: "records.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: new Uint8Array(await book.xlsx.writeBuffer()),
  };
}
// Small ZIP writer used only to test malformed XML/ranges without asking ExcelJS
// to allocate their potentially enormous cell models first.
export async function changeWorkbook(
  bytes: Uint8Array,
  changes: Record<string, ((text: string) => string) | undefined>,
) {
  const archive = await fromBufferPromise(Buffer.from(bytes));
  const entries: [string, Buffer][] = [];
  try {
    for await (const entry of archive.eachEntry()) {
      if (entry.fileName.endsWith("/")) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of await archive.openReadStreamPromise(entry))
        chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      entries.push([
        entry.fileName,
        changes[entry.fileName]
          ? Buffer.from(changes[entry.fileName]!(raw.toString()))
          : raw,
      ]);
    }
  } finally {
    archive.close();
  }
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const filename = Buffer.from(name),
      compressed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    locals.push(local, filename, compressed);
    central.push(directory, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const dir = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
