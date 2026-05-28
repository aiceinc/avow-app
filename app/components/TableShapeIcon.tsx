/**
 * TableShapeIcon — small outline glyph for a round or rectangular table.
 * Uses currentColor so it inherits the button's text colour.
 * Shared by the left sidebar and the empty-area context menu.
 */
export default function TableShapeIcon({ shape }: { shape: 'round' | 'rectangular' }) {
  if (shape === 'round') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
      <rect x="1" y="1.5" width="16" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
