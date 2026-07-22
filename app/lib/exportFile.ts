/**
 * exportFile.ts — client-side file generation for the export features.
 *
 * Everything is built in the browser from data the page has already queried and
 * handed to the user as a Blob download: no Convex file storage, no server
 * round-trip, and no new dependencies.
 */

/** Trigger a browser download of `content` as `filename`. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Escape one CSV field per RFC 4180: wrap in quotes when the value contains a
 * comma, quote, or newline, and double any embedded quotes.
 *
 * Also guards against CSV injection — a value starting with = + - or @ is
 * treated as a formula by Excel/Sheets, so we prefix it with an apostrophe.
 * Guest names and notes are free text, so this is a real risk, not theoretical.
 */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

/** Build a CSV document from rows + an explicit column spec. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => csvField(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvField(c.value(r))).join(','));
  // CRLF line endings + a leading UTF-8 BOM. The BOM is built with fromCharCode
  // because a literal one in source gets normalised away by editors; without it
  // Excel mangles accented names.
  const bom = String.fromCharCode(0xfeff);
  const crlf = String.fromCharCode(13) + String.fromCharCode(10);
  return bom + [head, ...body].join(crlf) + crlf;
}

/** `Sam & Riley's Wedding` -> `sam-rileys-wedding` (safe in a filename). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'wedding'
  );
}

/** `avow-sam-rileys-wedding-guests-2026-07-22.csv` */
export function exportFilename(workspaceName: string, part: string, ext: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return `avow-${slugify(workspaceName)}-${part}-${stamp}.${ext}`;
}
