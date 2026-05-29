'use client';

/**
 * GuestFormModal — add/edit a guest. Used by the Guest List module for both
 * creating (no `initial`) and editing (pre-populated from `initial`). The
 * parent owns persistence: this component validates + collects values and calls
 * onSave, then the parent closes it.
 */

import { useState, FormEvent } from 'react';
import { Doc } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import {
  Side,
  RsvpStatus,
  sideOptions,
  RSVP_OPTIONS,
} from '@/app/lib/guests';

export type GuestFormValues = {
  name: string;
  side: Side;
  rsvpStatus: RsvpStatus;
  dietaryNotes: string;
  hasPlusOne: boolean;
  plusOneName: string;
};

export default function GuestFormModal({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Doc<'guests'> | null;
  onSave: (values: GuestFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = !!initial;
  const { partnerNames } = useWorkspace();

  const [name, setName]               = useState(initial?.name ?? '');
  const [side, setSide]               = useState<Side>(initial?.side ?? 'both');
  const [rsvpStatus, setRsvpStatus]   = useState<RsvpStatus>(initial?.rsvpStatus ?? 'pending');
  const [dietaryNotes, setDietary]    = useState(initial?.dietaryNotes ?? '');
  const [hasPlusOne, setHasPlusOne]   = useState(initial?.hasPlusOne ?? false);
  const [plusOneName, setPlusOneName] = useState(initial?.plusOneName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        side,
        rsvpStatus,
        dietaryNotes: dietaryNotes.trim(),
        hasPlusOne,
        plusOneName: hasPlusOne ? plusOneName.trim() : '',
      });
      // Parent closes the modal on success.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save guest');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(26, 31, 46, 0.3)' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl text-ink mb-5">
          {editing ? 'Edit guest' : 'Add a guest'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {/* Side — segmented */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Side</label>
            <div className="flex border border-rule rounded-lg p-1 gap-1">
              {sideOptions(partnerNames).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSide(opt.value)}
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
                    side === opt.value ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* RSVP — segmented */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">RSVP status</label>
            <div className="flex border border-rule rounded-lg p-1 gap-1">
              {RSVP_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRsvpStatus(opt.value)}
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
                    rsvpStatus === opt.value ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dietary notes */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              Dietary notes <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={dietaryNotes}
              onChange={e => setDietary(e.target.value)}
              placeholder="e.g. vegetarian, no gluten"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {/* Plus-one */}
          <div>
            <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasPlusOne}
                onChange={e => setHasPlusOne(e.target.checked)}
                className="accent-[#b08968] w-4 h-4"
              />
              Has a plus-one
            </label>
            {hasPlusOne && (
              <input
                type="text"
                value={plusOneName}
                onChange={e => setPlusOneName(e.target.value)}
                placeholder="Plus-one name (optional)"
                className="app-input w-full text-sm px-3 py-2.5 mt-2"
              />
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="btn btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn btn-primary text-sm px-4 py-2"
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add a guest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
