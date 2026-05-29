/**
 * AppFooter — slim footer bar shown across the app.
 * Version on the left, copyright on the right (mirrors the landing footer).
 */
export default function AppFooter() {
  return (
    <footer className="flex items-center justify-between px-10 py-4 border-t border-rule text-xs text-ink-faint tracking-wide shrink-0">
      <span>v1.4.0</span>
      <span>© 2026 AICE Inc.</span>
    </footer>
  );
}
