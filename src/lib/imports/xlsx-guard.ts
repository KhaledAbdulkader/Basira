import { fromBufferPromise } from "yauzl";
import { SaxesParser } from "saxes";
import { IMPORT_LIMITS as limits } from "./constants";
import { ImportError } from "./errors";

// Drain and validate actual inflated bytes before ExcelJS allocates a workbook.
// Nothing is extracted to disk; external resources and document types are rejected.
export async function inspectWorkbook(buffer: Buffer) {
  const archive = await fromBufferPromise(buffer, {
    validateEntrySizes: true,
    strictFileNames: true,
  });
  const names = new Set<string>();
  const numeric = new Map<string, string>();
  let expanded = 0;
  let sheets = 0;
  let nodes = 0;
  let cells = 0;
  let date1904 = false;
  try {
    for await (const entry of archive.eachEntry()) {
      if (names.has(entry.fileName) || names.size >= limits.archiveEntries)
        throw new ImportError(
          422,
          "The workbook contains too many or duplicate archive entries.",
        );
      names.add(entry.fileName);
      if (entry.generalPurposeBitFlag & 1)
        throw new ImportError(
          422,
          "Password-protected workbooks are not supported.",
        );
      if (entry.uncompressedSize > limits.entryBytes)
        throw new ImportError(
          413,
          "A workbook part is too large. Use a smaller, plain worksheet.",
        );
      if (entry.fileName.endsWith("/")) continue;
      if (
        !/\.(xml|rels)$/i.test(entry.fileName) ||
        /(?:vba|macrosheets|embeddings|externalLinks|activeX|customUI)/i.test(
          entry.fileName,
        )
      )
        throw new ImportError(
          422,
          "Use a plain XLSX workbook without macros, embedded files, images, or external links.",
        );
      const worksheet = /^xl\/worksheets\/[^/]+\.xml$/.test(entry.fileName);
      if (worksheet && ++sheets > 1)
        throw new ImportError(422, "Use exactly one worksheet per import.");
      const parser = new SaxesParser({ xmlns: true });
      let depth = 0;
      let currentCell = "";
      let cellType = "";
      let valueText = "";
      let inValue = false;
      const seenCells = new Set<string>();
      parser.on("doctype", () => {
        throw new ImportError(
          422,
          "Document types and XML entities are not supported.",
        );
      });
      parser.on("opentag", (node) => {
        if (++depth > 40 || ++nodes > 150000)
          throw new ImportError(
            413,
            "The workbook is too complex. Use a plain worksheet.",
          );
        const attr = (key: string) =>
          Object.values(node.attributes).find((value) => value.local === key)
            ?.value;
        // ExcelJS expands these ranges into cells. Reject them before allocation,
        // even when a tiny XML part declares a full-sheet range.
        if (
          [
            "mergeCell",
            "definedName",
            "dataValidation",
            "conditionalFormatting",
          ].includes(node.local)
        )
          throw new ImportError(
            422,
            "Use a plain worksheet without merged cells, named ranges, data validation, or conditional formatting.",
          );
        if (
          Object.values(node.attributes).some((value) =>
            /macroEnabled|vbaProject|oleObject/i.test(value.value),
          ) ||
          attr("TargetMode")?.toLowerCase() === "external"
        )
          throw new ImportError(
            422,
            "Remove macros and external links before importing.",
          );
        if (entry.fileName === "xl/workbook.xml" && node.local === "workbookPr")
          date1904 = ["1", "true"].includes(attr("date1904") ?? "");
        if (
          worksheet &&
          node.local === "col" &&
          (!/^[1-9]\d*$/.test(attr("min") ?? "") ||
            !/^[1-9]\d*$/.test(attr("max") ?? "") ||
            Number(attr("min")) > Number(attr("max")) ||
            Number(attr("max")) > limits.columns)
        )
          throw new ImportError(
            413,
            "Remove formatting beyond the supported worksheet columns.",
          );
        if (
          worksheet &&
          node.local === "row" &&
          (!/^[1-9]\d*$/.test(attr("r") ?? "") ||
            Number(attr("r")) > limits.rows + 1)
        )
          throw new ImportError(
            413,
            `Keep worksheet rows within 1–${limits.rows + 1}, including the header.`,
          );
        if (worksheet && node.local === "c") {
          currentCell = attr("r") ?? "";
          const match = /^([A-Z]+)([1-9]\d*)$/.exec(currentCell);
          const column =
            match?.[1]
              ?.split("")
              .reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) ?? 0;
          if (
            !match ||
            column > limits.columns ||
            Number(match[2]) > limits.rows + 1 ||
            ++cells > (limits.rows + 1) * limits.columns
          )
            throw new ImportError(
              413,
              "The worksheet exceeds the supported row or column limits.",
            );
          if (seenCells.has(currentCell))
            throw new ImportError(
              422,
              "The worksheet contains duplicate cell references.",
            );
          seenCells.add(currentCell);
          cellType = attr("t") ?? "n";
        }
        if (worksheet && node.local === "v") {
          inValue = true;
          valueText = "";
        }
      });
      parser.on("text", (text) => {
        if (inValue) valueText += text;
      });
      parser.on("closetag", (node) => {
        depth--;
        if (worksheet && node.local === "v") {
          inValue = false;
          if (cellType === "n") numeric.set(currentCell, valueText);
        }
      });
      const stream = await archive.openReadStreamPromise(entry);
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let entrySize = 0;
      try {
        for await (const chunk of stream) {
          const bytes = chunk as Buffer;
          entrySize += bytes.length;
          expanded += bytes.length;
          if (entrySize > limits.entryBytes || expanded > limits.expandedBytes)
            throw new ImportError(
              413,
              "Expanded workbook contents are too large.",
            );
          parser.write(decoder.decode(bytes, { stream: true }));
        }
        parser.write(decoder.decode()).close();
      } finally {
        stream.destroy();
      }
    }
    if (
      sheets !== 1 ||
      !names.has("[Content_Types].xml") ||
      !names.has("xl/workbook.xml")
    )
      throw new ImportError(422, "This file is not a supported XLSX workbook.");
    return { numeric, date1904 };
  } finally {
    archive.close();
  }
}
