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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.25)' }}
      onClick={onCancel} // click backdrop to dismiss
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()} // don't dismiss when clicking inside
      >
        <p className="text-sm text-gray-700 leading-relaxed mb-6">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`text-sm px-4 py-2 text-white rounded-lg transition-colors ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-900 hover:bg-gray-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
