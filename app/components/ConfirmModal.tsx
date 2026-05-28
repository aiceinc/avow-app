'use client';

/**
 * ConfirmModal — a simple confirmation dialog.
 * Replaces the native browser `confirm()` popup throughout the app.
 */

type Props = {
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
  /** Optional label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** If true, the confirm button is styled red (destructive actions). */
  destructive?: boolean;
};

export default function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  destructive  = false,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(26, 31, 46, 0.3)' }}
      onClick={onCancel} // click backdrop to dismiss
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()} // don't dismiss when clicking inside
      >
        <p className="text-sm text-ink-soft leading-relaxed mb-6">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn btn-secondary text-sm px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`btn text-sm px-4 py-2 ${
              destructive
                ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                : 'btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
