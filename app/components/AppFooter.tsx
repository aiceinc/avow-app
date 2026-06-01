import Link from 'next/link';

/**
 * AppFooter — slim footer bar shown across the app.
 * Version (left) · Privacy Policy (centered) · copyright (right).
 * Mirrors the landing footer. Uses a 3-column grid so the Privacy Policy link
 * is truly centered regardless of the side items' widths.
 */
export default function AppFooter() {
  return (
    <footer className="grid grid-cols-3 items-center px-10 py-4 border-t border-rule text-xs text-ink-faint tracking-wide shrink-0">
      <span className="justify-self-start">v1.10.3</span>
      <Link
        href="/privacy"
        className="justify-self-center hover:text-ink-soft transition-colors"
      >
        Privacy Policy
      </Link>
      <span className="justify-self-end">© 2026 AICE Inc.</span>
    </footer>
  );
}
