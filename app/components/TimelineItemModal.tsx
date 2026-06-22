'use client';

/**
 * TimelineItemModal — add/edit a day-of timeline item. Mirrors VendorFormModal:
 * the parent owns persistence; this collects + validates and calls onSave.
 * Reuses the vendor-picker pattern from the budget editor.
 */

import { useState, FormEvent } from 'react';
import { Doc, Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/app/lib/errors';
import { minutesToInput, parseTimeInput } from '@/app/lib/timeline';

export type TimelineItemFormValues = {
  time: number; // minutes from midnight
  title: string;
  location: string;
  vendorId: Id<'vendors'> | null;
  responsibleParty: string;
  notes: string;
};

type Vendor = Pick<Doc<'vendors'>, '_id' | 'name'>;

export default function TimelineItemModal({
  initial,
  vendors,
  onSave,
  onCancel,
}: {
  initial?: Doc<'timelineItems'> | null;
  vendors: Vendor[];
  onSave: (values: TimelineItemFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = !!initial;

  const [time, setTime]                 = useState(initial ? minutesToInput(initial.time) : '');
  const [title, setTitle]               = useState(initial?.title ?? '');
  const [location, setLocation]         = useState(initial?.location ?? '');
  const [vendorId, setVendorId]         = useState<Id<'vendors'> | ''>(initial?.vendorId ?? '');
  const [responsibleParty, setResponsibleParty] = useState(initial?.responsibleParty ?? '');
  const [notes, setNotes]               = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const minutes = parseTimeInput(time);
    if (minutes === null) { setError('Enter a time for this event.'); return; }
    if (!title.trim()) { setError('Event title is required.'); return; }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        time: minutes,
        title: title.trim(),
        location: location.trim(),
        vendorId: vendorId || null,
        responsibleParty: responsibleParty.trim(),
        notes: notes.trim(),
      });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save event'));
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
        className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl text-ink mb-5">
          {editing ? 'Edit event' : 'Add an event'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Event</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Ceremony begins"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {/* Time + Location */}
          <div className="flex gap-3">
            <div className="w-32">
              <label className="block text-xs font-medium text-ink-soft mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="app-input w-full text-sm px-3 py-2.5 tabular-nums"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Location <span className="text-ink-faint font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Garden terrace"
                className="app-input w-full text-sm px-3 py-2.5"
              />
            </div>
          </div>

          {/* Vendor — picker (reuses the Vendors module) */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              Vendor <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <select
              value={vendorId}
              onChange={e => setVendorId(e.target.value as Id<'vendors'> | '')}
              className="app-input w-full text-sm px-3 py-2.5"
            >
              <option value="">— None —</option>
              {vendors.map(vn => (
                <option key={vn._id} value={vn._id}>{vn.name}</option>
              ))}
            </select>
            {vendors.length === 0 && (
              <p className="text-xs text-ink-faint mt-1">
                Add vendors in the Vendors tab to link them here.
              </p>
            )}
          </div>

          {/* Responsible party */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              Responsible <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={responsibleParty}
              onChange={e => setResponsibleParty(e.target.value)}
              placeholder="e.g. Coordinator, Maid of honor"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              Notes <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Cue the string quartet"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="btn btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary text-sm px-4 py-2">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add an event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
