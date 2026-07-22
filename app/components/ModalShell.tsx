'use client';

/**
 * ModalShell — the shared backdrop + card wrapper for every modal in the app.
 *
 * Extracted because the same "fixed inset-0 backdrop + centred white card +
 * stopPropagation" block was copy-pasted across seven places, and the backdrop
 * opacity had already drifted three ways (0.3, 0.35, and bg-black/40). This is
 * now the single source of truth for the backdrop; each caller still supplies
 * its own card classes via `cardClassName`, so no modal's appearance changes.
 *
 * Behaviour: clicking the backdrop dismisses, clicking inside does not. Pass
 * `dismissOnBackdrop={false}` to block dismissal (e.g. while a save is in
 * flight).
 */
export default function ModalShell({
  onDismiss,
  cardClassName = 'bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4',
  dismissOnBackdrop = true,
  padded = false,
  children,
}: {
  onDismiss: () => void;
  cardClassName?: string;
  dismissOnBackdrop?: boolean;
  /** Adds outer padding — used by the modals that need breathing room on small screens. */
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center animate-fade-in${padded ? ' p-4' : ''}`}
      style={{ background: 'rgba(26, 31, 46, 0.3)' }}
      onClick={() => { if (dismissOnBackdrop) onDismiss(); }}
    >
      <div className={cardClassName} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
