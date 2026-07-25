/**
 * Minimal RFC 4180 CSV reader. Excel and Google Sheets both emit this dialect,
 * so a dependency-free parser is enough — but it must handle the cases real
 * spreadsheet exports produce: quoted fields containing commas or newlines,
 * doubled quotes as an escape, CRLF endings, and the UTF-8 BOM Excel prepends.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ''); // Excel writes a BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false; // distinguishes a quoted empty field from a blank line

  const endField = () => { row.push(field); field = ''; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && !started) { inQuotes = true; started = true; continue; }
    if (ch === ',') { endField(); continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); continue; }
    if (ch === '\n') { endRow(); continue; }
    field += ch;
    started = true;
  }

  // Flush trailing content, but don't invent a row from a trailing newline.
  if (field !== '' || row.length > 0) endRow();

  // Drop entirely blank rows (common at the end of spreadsheet exports).
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

/** Build a CSV line, quoting only when required. */
export function toCsvRow(cells: string[]): string {
  return cells
    .map(c => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
    .join(',');
}
