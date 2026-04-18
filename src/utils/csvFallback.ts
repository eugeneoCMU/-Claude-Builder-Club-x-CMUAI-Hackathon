import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { RawRow } from "../types.js";
import { createLogger } from "./logger.js";

const log = createLogger("csv-fallback");

/**
 * Read the CSV seed file and return rows starting just after `lastRowIndex`.
 *
 * The CSV is expected to have a header line (row 1) and data rows from row 2 onward.
 * Columns accepted (case-insensitive): regret, proud, dream. Anything else (name,
 * timestamp, email) is ignored so the format matches what an exported Google Sheet
 * would look like.
 *
 * row_index is 1-based to match the Sheets convention (header = row 1).
 */
export async function readCsvRows(
  filePath: string,
  lastRowIndex: number
): Promise<RawRow[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log.warn(`CSV fallback file not found at ${filePath}`);
      return [];
    }
    throw err;
  }

  const records = parse(raw, {
    columns: (headers: string[]) =>
      headers.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: RawRow[] = [];
  records.forEach((rec, idx) => {
    const rowIndex = idx + 2;
    if (rowIndex <= lastRowIndex) return;
    const regret = (rec.regret ?? "").toString();
    const proud = (rec.proud ?? rec["proudest moment"] ?? "").toString();
    const dream = (rec.dream ?? rec["half-finished dream"] ?? "").toString();
    rows.push({ row_index: rowIndex, regret, proud, dream });
  });

  return rows;
}
