/**
 * FilterPill — a small toggleable pill button used for list filters
 * (guests, vendors). Shared so the two pages can't drift.
 */
export default function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? 'bg-accent border-accent text-white'
          : 'border-rule text-ink-soft hover:border-accent'
      }`}
    >
      {children}
    </button>
  );
}
