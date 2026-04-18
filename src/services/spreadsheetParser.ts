import { google } from "googleapis";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { readCsvRows } from "../utils/csvFallback.js";
import {
  getLastProcessedRowIndex,
  setLastProcessedRowIndex,
} from "../db/database.js";
import type { RawRow } from "../types.js";

const log = createLogger("spreadsheet");

type SheetsSource = "google-sheets" | "csv";

export interface PollingHandle {
  source: SheetsSource;
  stop: () => void;
}

async function fetchSheetRows(lastRowIndex: number): Promise<RawRow[]> {
  if (!config.sheetsCredentials || !config.sheetsSpreadsheetId) {
    throw new Error("Google Sheets not configured");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: config.sheetsCredentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetsSpreadsheetId!,
        range: "Sheet1!A:D",
      }),
    { maxAttempts: 3, baseDelayMs: 1000 }
  );

  const values = res.data.values ?? [];
  const rows: RawRow[] = [];
  values.forEach((row, idx) => {
    const rowIndex = idx + 1;
    if (idx === 0) return;
    if (rowIndex <= lastRowIndex) return;
    const [, regret = "", proud = "", dream = ""] = row as string[];
    rows.push({
      row_index: rowIndex,
      regret: (regret ?? "").toString(),
      proud: (proud ?? "").toString(),
      dream: (dream ?? "").toString(),
    });
  });
  return rows;
}

function sanitizeRow(row: RawRow): RawRow | null {
  const regret = row.regret.trim();
  const proud = row.proud.trim();
  const dream = row.dream.trim();

  if (!regret || !proud || !dream) {
    log.warn(
      `Row ${row.row_index} skipped: one or more reflection fields are empty`
    );
    return null;
  }

  const max = config.maxReflectionLength;
  const truncate = (s: string) => (s.length > max ? s.slice(0, max) : s);

  return {
    row_index: row.row_index,
    regret: truncate(regret),
    proud: truncate(proud),
    dream: truncate(dream),
  };
}

export function startPolling(
  intervalMs: number,
  onNewRow: (row: RawRow) => void | Promise<void>
): PollingHandle {
  const source: SheetsSource = config.sheetsConfigured
    ? "google-sheets"
    : "csv";

  log.info(
    `Starting ${source} polling every ${intervalMs}ms` +
      (source === "csv" ? ` (reading ${config.csvFallbackPath})` : "")
  );

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const lastIdx = getLastProcessedRowIndex();
      const rows =
        source === "google-sheets"
          ? await fetchSheetRows(lastIdx)
          : await readCsvRows(config.csvFallbackPath, lastIdx);

      if (rows.length > 0) {
        log.info(`Found ${rows.length} new row(s) to process`);
      }

      let maxIdx = lastIdx;
      for (const raw of rows) {
        if (stopped) break;
        const sanitized = sanitizeRow(raw);
        if (sanitized) {
          await onNewRow(sanitized);
        }
        maxIdx = Math.max(maxIdx, raw.row_index);
      }
      if (maxIdx > lastIdx) {
        setLastProcessedRowIndex(maxIdx);
      }
    } catch (err) {
      log.error(`Polling error: ${(err as Error).message}`);
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  tick();

  return {
    source,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      log.info(`${source} polling stopped`);
    },
  };
}
