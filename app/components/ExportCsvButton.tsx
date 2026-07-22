'use client';

/**
 * ExportCsvButton — the shared "Export CSV" control used by the Guest List,
 * Budget, Vendors, Timeline and Seating modules.
 *
 * Deliberately NOT gated on `canEdit`: exporting is a read, and a read-only or
 * lapsed workspace must still be able to get its data out.
 */
export default function ExportCsvButton({
  onExport,
  disabled = false,
  label = 'Export CSV',
  title,
}: {
  onExport: () => void;
  disabled?: boolean;
  label?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onExport}
      disabled={disabled}
      title={title ?? (disabled ? 'Nothing to export yet' : 'Download as a spreadsheet (CSV)')}
      className="text-xs text-ink-soft hover:text-ink border border-rule hover:border-accent rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-rule"
    >
      {label}
    </button>
  );
}
