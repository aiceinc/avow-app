/**
 * AppFooter — slim footer bar shown across the app.
 * Version on the left, copyright on the right (mirrors the landing footer).
 */
export default function AppFooter() {
  return (
    <footer className="flex items-center justify-between px-4 py-2.5 border-t border-rule text-xs text-ink-faint tracking-wide shrink-0">
      <span>v1.1.2</span>
      <span>© 2026 AICE Inc.</span>
    </footer>
  );
}
