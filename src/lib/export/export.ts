type Row = Record<string, unknown>;

/**
 * Export runs in the browser on data the server already filtered.
 * SheetJS is imported dynamically so ~400KB never enters the main bundle —
 * it loads only when someone actually clicks "Export as Excel".
 */

export function downloadCsv(rows: Row[], filename: string) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]!);
  const escape = (value: unknown) => {
    const s = value == null ? "" : String(value);
    // Guard against CSV injection: a leading =, +, - or @ can execute
    // as a formula when the file is opened in Excel.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\r\n");

  // BOM so Excel reads UTF-8 correctly (₹ and accented characters).
  triggerDownload(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export async function downloadExcel(rows: Row[], filename: string) {
  if (!rows.length) return;

  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows);

  // Auto-size columns to content, capped so one long cell doesn't dominate.
  const headers = Object.keys(rows[0]!);
  sheet["!cols"] = headers.map((h) => ({
    wch: Math.min(40, Math.max(h.length + 2, ...rows.map((r) => String(r[h] ?? "").length + 2))),
  }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Data");
  XLSX.writeFile(book, `${filename}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
