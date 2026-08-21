import { LIMITS, capLen } from './limits';
import { parseCsvRows, toCsvRow } from './csv';
import type { PantryLevel, PantryLocation } from './types';

/**
 * The CSV contract for bootstrapping the pantry.
 *
 * A header row is required. `item` is the only mandatory column; the rest are
 * optional. Recognition is case-insensitive and accepts a few natural aliases,
 * but anything outside the contract is reported rather than silently guessed —
 * a quietly mis-imported inventory is worse than a rejected file.
 */
export const CSV_COLUMNS = {
  item: ['item', 'name', 'product', 'ingredient'],
  quantity: ['quantity', 'qty', 'amount', 'count'],
  weight: ['weight', 'wt', 'size', 'net weight', 'package size', 'volume'],
  location: ['location', 'where', 'place', 'area'],
  level: ['level', 'stock', 'fullness'],
} as const;

export type CsvField = keyof typeof CSV_COLUMNS;

const LOCATION_ALIASES: Record<string, PantryLocation> = {
  pantry: 'pantry', cupboard: 'pantry', cabinet: 'pantry', shelf: 'pantry',
  fridge: 'fridge', refrigerator: 'fridge', refrigerated: 'fridge', chilled: 'fridge',
  freezer: 'freezer', frozen: 'freezer',
};

const LEVEL_ALIASES: Record<string, PantryLevel> = {
  low: 'low', empty: 'low', 'almost out': 'low', 'running low': 'low',
  medium: 'medium', med: 'medium', half: 'medium', 'half full': 'medium', ok: 'medium',
  high: 'high', full: 'high', plenty: 'high', stocked: 'high',
};

export const MAX_IMPORT_ROWS = 500;

export interface ImportItem {
  name: string;
  quantity?: string;
  weight?: string;
  location?: PantryLocation;
  level?: PantryLevel;
}

export interface ImportIssue {
  /** 1-based line number as seen in the spreadsheet, header included. */
  row: number;
  message: string;
}

export interface ImportResult {
  items: ImportItem[];
  issues: ImportIssue[];
  /** Set when the file's structure is wrong; nothing should be imported. */
  fatal?: string;
  /** Which header each recognized field was matched from, for the preview. */
  matched: Partial<Record<CsvField, string>>;
}

function matchHeaders(header: string[]): { index: Partial<Record<CsvField, number>>; matched: Partial<Record<CsvField, string>> } {
  const index: Partial<Record<CsvField, number>> = {};
  const matched: Partial<Record<CsvField, string>> = {};
  header.forEach((raw, i) => {
    const key = raw.trim().toLowerCase();
    (Object.keys(CSV_COLUMNS) as CsvField[]).forEach(field => {
      if (index[field] !== undefined) return;
      if ((CSV_COLUMNS[field] as readonly string[]).includes(key)) {
        index[field] = i;
        matched[field] = raw.trim();
      }
    });
  });
  return { index, matched };
}

/**
 * Validate a CSV file's text into importable rows. Returns per-row issues so
 * the UI can show exactly what's wrong and where, rather than failing silently.
 */
export function parsePantryCsv(text: string): ImportResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { items: [], issues: [], matched: {}, fatal: 'That file is empty.' };
  }

  const { index, matched } = matchHeaders(rows[0].cells);
  if (index.item === undefined) {
    return {
      items: [], issues: [], matched: {},
      fatal: `No "Item" column found. The first row must be a header containing a column named Item (or Name/Product). Found: ${rows[0].cells.map(h => h.trim()).filter(Boolean).join(', ') || '(nothing)'}`,
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { items: [], issues: [], matched, fatal: 'That file has a header row but no items.' };
  }

  const items: ImportItem[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  let firstSkippedLine: number | null = null;

  dataRows.forEach(({ cells, line: lineNo }) => {
    if (items.length >= MAX_IMPORT_ROWS) {
      if (firstSkippedLine === null) firstSkippedLine = lineNo;
      return;
    }

    const cell = (f: CsvField) => {
      const at = index[f];
      return at === undefined ? '' : (cells[at] ?? '').trim();
    };

    const rawName = cell('item');
    if (!rawName) {
      issues.push({ row: lineNo, message: 'No item name — row skipped.' });
      return;
    }

    const name = capLen(rawName, LIMITS.title);
    const dedupeKey = name.toLowerCase();
    if (seen.has(dedupeKey)) {
      issues.push({ row: lineNo, message: `Duplicate of "${name}" — row skipped.` });
      return;
    }
    seen.add(dedupeKey);

    const item: ImportItem = { name };

    const qty = cell('quantity');
    if (qty) item.quantity = capLen(qty, LIMITS.title);

    const wt = cell('weight');
    if (wt) item.weight = capLen(wt, LIMITS.title);

    const rawLoc = cell('location');
    if (rawLoc) {
      const loc = LOCATION_ALIASES[rawLoc.toLowerCase()];
      if (loc) item.location = loc;
      else issues.push({ row: lineNo, message: `Location "${rawLoc}" isn't recognized — use Pantry, Fridge, or Freezer. Imported as Unsorted.` });
    }

    const rawLevel = cell('level');
    if (rawLevel) {
      const lvl = LEVEL_ALIASES[rawLevel.toLowerCase()];
      if (lvl) item.level = lvl;
      else issues.push({ row: lineNo, message: `Level "${rawLevel}" isn't recognized — use Low, Medium, or High. Left blank.` });
    }

    items.push(item);
  });

  // Reported only when the cap actually stopped us, and pointed at the real
  // line we stopped on — a file with lots of blank or duplicate rows can be
  // longer than the cap without ever hitting it.
  if (firstSkippedLine !== null) {
    issues.push({
      row: firstSkippedLine,
      message: `Only the first ${MAX_IMPORT_ROWS} items were read; everything from line ${firstSkippedLine} on was ignored.`,
    });
  }

  return { items, issues, matched };
}

/** The exact structure the importer expects, as a downloadable starting point. */
export function buildTemplateCsv(): string {
  return [
    toCsvRow(['Item', 'Quantity', 'Weight', 'Location', 'Level']),
    toCsvRow(['Black beans', '2 cans', '15 oz', 'Pantry', '']),
    toCsvRow(['Olive oil', '1 bottle', '500 ml', 'Pantry', 'Low']),
    toCsvRow(['Rice', '1 bag', '5 lb', 'Pantry', 'High']),
    toCsvRow(['Butter', '1', '', 'Fridge', '']),
    toCsvRow(['Frozen peas', '2 bags', '12 oz', 'Freezer', 'High']),
  ].join('\r\n') + '\r\n';
}
