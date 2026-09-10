import * as XLSX from "xlsx";

/**
 * Parse the first worksheet of an Excel file into an array of row objects.
 *
 * `raw: true` keeps the underlying cell values instead of the formatted display
 * text. That matters for dates/times: a date cell whose display format is
 * `MM/DD/YYYY` or a 12-hour time would otherwise be handed to us as an ambiguous
 * string (e.g. "09/01/2026", "07:07:24 PM"). With raw values, date/time cells
 * arrive as Excel serial numbers and are converted deterministically in
 * `normalizeRows`.
 */
export async function parseExcel(
  file: File,
): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: true,
  });
  return rows;
}

export function exportExcel(
  filename: string,
  rows: Record<string, unknown>[],
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, filename);
}

export function exportCsv(
  filename: string,
  rows: Record<string, unknown>[],
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
