import Link from 'next/link';

/**
 * AppFooter — the shared dark footer (matches the /auth marketing footer).
 * Wordmark (left) · Privacy + Contact + version/© (right), on bg-ink.
 * Used across the app shell, /auth, and other surfaces so the footer is one
 * consistent element everywhere.
 */
export default function AppFooter() {
  return (
    <footer className="bg-ink px-6 sm:px-10 py-3 flex items-center justify-between gap-4 shrink-0">
      <span className="wordmark text-sm" style={{ color: 'rgba(250, 246, 240, 0.5)' }}>
        avow<span className="dot" />
      </span>
      <div className="flex items-center gap-7">
        <Link href="/privacy" className="text-xs tracking-wide text-bg/40 hover:text-bg transition-colors">Privacy</Link>
        <a href="mailto:hello@avow.wedding" className="text-xs tracking-wide text-bg/40 hover:text-bg transition-colors">Contact</a>
        <span className="text-xs tracking-wide text-bg/30">v1.25.0 · © 2026 Avow</span>
      </div>
    </footer>
  );
}
