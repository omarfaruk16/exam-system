import ExcelJS from 'exceljs';

/** Normalizes an exceljs cell (hyperlink/formula/richtext/date object) to plain text. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if ('result' in o) return String(o.result ?? '');
    if (Array.isArray(o.richText))
      return o.richText.map((r) => (r as { text: string }).text).join('');
    return String(v);
  }
  return String(v);
}

export interface SheetRow {
  rowNumber: number; // 1-based, matching what the user sees (header is row 1)
  cells: Record<string, string>; // keyed by lower-cased header
}

/**
 * Read an uploaded .xlsx or .csv into header-keyed rows. CSV is detected by extension.
 * Header keys are lower-cased so validators can match case-insensitively.
 */
export async function readImportRows(filePath: string, originalName: string): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  if (originalName.toLowerCase().endsWith('.csv')) {
    await wb.csv.readFile(filePath);
  } else {
    await wb.xlsx.readFile(filePath);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Uploaded file has no worksheets');

  // Iterate with eachRow rather than a `for r <= ws.rowCount` loop: files produced by Excel
  // or Google Sheets often omit the sheet <dimension> tag, so rowCount can read as 0 and the
  // loop would extract nothing. eachRow walks the actual rows regardless. The first non-empty
  // row is the header; `includeEmpty: true` on cells keeps column indexes aligned when a data
  // cell in the middle is blank.
  const headers: string[] = [];
  const rows: SheetRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headers.length === 0) {
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col] = cellText(cell.value).trim().toLowerCase();
      });
      return;
    }
    const cells: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const h = headers[col];
      if (!h) return;
      const text = cellText(cell.value).trim();
      if (text !== '') cells[h] = text;
    });
    if (Object.keys(cells).length > 0) rows.push({ rowNumber, cells });
  });
  return rows;
}

/** First non-empty value among the given header aliases. */
export function pick(cells: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = cells[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
