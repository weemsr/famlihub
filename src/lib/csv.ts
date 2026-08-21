/**
 * Minimal RFC 4180 CSV reader. Excel and Google Sheets both emit this dialect,
 * so a dependency-free parser is enough — but it must handle the cases real
 * spreadsheet exports produce: quoted fields containing commas or newlines,
 * doubled quotes as an escape, CRLF endings, and the UTF-8 BOM Excel prepends.
 */
/** A parsed row plus the 1-based line it started on in the original file. */
export interface CsvRow {
  cells: string[];
  /** Line number as the user sees it in their spreadsheet, header included.
   *  Carried through because blank rows are dropped below, so a row's index in
   *  the returned array stops matching its position in the file. */
  line: number;
}

/**
 * Parse into rows tagged with their original line numbers. Blank rows are
 * dropped (spreadsheet exports are full of them) but the surviving rows keep
 * the line they actually came from, so error messages can point at the right
 * place in the user's file.
 */
export function parseCsvRows(input: string): CsvRow[] {
  const text = input.replace(/^﻿/, ''); // Excel writes a BOM
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false; // distinguishes a quoted empty field from a blank line
  let line = 1;        // line the current row started on
  let nextLine = 1;    // running line counter (quoted fields can span lines)

  const endField = () => { row.push(field); field = ''; started = false; };
  const endRow = () => { endField(); rows.push({ cells: row, line }); row = []; line = nextLine; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else {
        if (ch === '\n') nextLine++;
        field += ch;
      }
      continue;
    }

    if (ch === '"' && !started) { inQuotes = true; started = true; continue; }
    if (ch === ',') { endField(); continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i++; nextLine++; endRow(); continue; }
    if (ch === '\n') { nextLine++; endRow(); continue; }
    field += ch;
    started = true;
  }

  // Flush trailing content, but don't invent a row from a trailing newline.
  if (field !== '' || row.length > 0) endRow();

  // Drop entirely blank rows (common at the end of spreadsheet exports).
  return rows.filter(r => r.cells.some(cell => cell.trim() !== ''));
}

/** Cells only, for callers that don't need to report line numbers. */
export function parseCsv(input: string): string[][] {
  return parseCsvRows(input).map(r => r.cells);
}

/** Build a CSV line, quoting only when required. */
export function toCsvRow(cells: string[]): string {
  return cells
    .map(c => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
    .join(',');
}
