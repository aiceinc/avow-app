'use client';

/**
 * /timeline — the Day-of Timeline module (v1.5.0).
 *
 * A chronological run-of-show for the wedding day: time-ordered events with an
 * optional location, vendor link (FK → vendors), responsible party, and notes.
 * Sorts by time (minutes from midnight), filters by vendor. Modal CRUD,
 * real-time via Convex useQuery — matches the Guest List / Vendors patterns.
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc, Id } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import ConfirmModal from '@/app/components/ConfirmModal';
import TimelineItemModal, { TimelineItemFormValues } from '@/app/components/TimelineItemModal';
import { formatTime } from '@/app/lib/timeline';

export default function TimelinePage() {
  const { workspaceId } = useWorkspace();

  const items   = useQuery(api.timeline.listItems,  { workspaceId });
  const vendors = useQuery(api.vendors.listVendors, { workspaceId }) ?? [];

  const addItem    = useMutation(api.timeline.addItem);
  const updateItem = useMutation(api.timeline.updateItem);
  const removeItem = useMutation(api.timeline.removeItem);

  const [vendorFilter, setVendorFilter] = useState<Id<'vendors'> | 'all' | 'none'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<Doc<'timelineItems'> | null>(null);
  const [deleting, setDeleting] = useState<Doc<'timelineItems'> | null>(null);

  // vendorId → name, for resolving an item's linked vendor.
  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const vn of vendors) m.set(vn._id, vn.name);
    return m;
  }, [vendors]);

  // Chronological by time; Array.sort is stable so equal times keep creation
  // order (the query returns rows in _creationTime order).
  const visible = useMemo(() => {
    let list = items ? [...items] : [];
    if (vendorFilter === 'none') list = list.filter(i => !i.vendorId);
    else if (vendorFilter !== 'all') list = list.filter(i => i.vendorId === vendorFilter);
    list.sort((a, b) => a.time - b.time);
    return list;
  }, [items, vendorFilter]);

  function openAdd() { setEditing(null); setFormOpen(true); }
  function openEdit(i: Doc<'timelineItems'>) { setEditing(i); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditing(null); }

  async function handleSave(values: TimelineItemFormValues) {
    if (editing) {
      await updateItem({
        itemId: editing._id,
        time: values.time,
        title: values.title,
        location: values.location,
        vendorId: values.vendorId,
        responsibleParty: values.responsibleParty,
        notes: values.notes,
      });
    } else {
      await addItem({
        workspaceId,
        time: values.time,
        title: values.title,
        location: values.location || undefined,
        vendorId: values.vendorId ?? undefined,
        responsibleParty: values.responsibleParty || undefined,
        notes: values.notes || undefined,
      });
    }
    closeForm();
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    await removeItem({ itemId: deleting._id });
    setDeleting(null);
  }

  const loading = items === undefined;
  const total = items?.length ?? 0;
  const isEmpty = !loading && total === 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-serif text-2xl text-ink">Day-of Timeline</h1>
            <p className="text-sm text-ink-faint mt-0.5">
              {total} event{total !== 1 ? 's' : ''}
            </p>
          </div>
          {!isEmpty && (
            <button onClick={openAdd} className="btn btn-primary text-sm px-4 py-2">
              + Add an event
            </button>
          )}
        </div>

        {loading && (
          <p className="text-sm text-ink-faint py-16 text-center">Loading timeline…</p>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="border border-dashed border-rule rounded-xl py-16 text-center animate-fade-in">
            <h2 className="font-serif text-xl text-ink mb-2">Plan your wedding day</h2>
            <p className="text-sm text-ink-soft mb-5 max-w-sm mx-auto">
              Build a time-ordered run-of-show — ceremony, photos, first dance — with who&apos;s
              responsible and which vendor is involved.
            </p>
            <button onClick={openAdd} className="btn btn-primary text-sm px-4 py-2">
              + Add an event
            </button>
          </div>
        )}

        {/* Controls + list */}
        {!loading && !isEmpty && (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-xs">
              <label className="flex items-center gap-1.5 text-ink-faint">
                Vendor
                <select
                  value={vendorFilter}
                  onChange={e => setVendorFilter(e.target.value as Id<'vendors'> | 'all' | 'none')}
                  className="app-input text-xs px-2 py-1 max-w-[12rem]"
                >
                  <option value="all">All</option>
                  {vendors.map(vn => (
                    <option key={vn._id} value={vn._id}>{vn.name}</option>
                  ))}
                  <option value="none">No vendor</option>
                </select>
              </label>
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-ink-faint py-12 text-center">No events match this filter.</p>
            ) : (
              <ul className="border border-rule rounded-xl overflow-hidden bg-white/60">
                {visible.map(item => (
                  <TimelineRow
                    key={item._id}
                    item={item}
                    vendorLabel={item.vendorId ? vendorName.get(item.vendorId) ?? 'Unknown vendor' : undefined}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeleting(item)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {formOpen && (
        <TimelineItemModal
          initial={editing}
          vendors={vendors}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}

      {deleting && (
        <ConfirmModal
          message={`Delete "${deleting.title}"?`}
          confirmLabel="Delete"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function TimelineRow({
  item,
  vendorLabel,
  onEdit,
  onDelete,
}: {
  item: Doc<'timelineItems'>;
  vendorLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const secondary = [item.location, item.responsibleParty, item.notes].filter(Boolean);

  return (
    <li className="group flex items-center gap-3 px-4 py-3 border-b border-rule last:border-b-0 hover:bg-bg-tint/50 transition-colors">
      {/* Time */}
      <span className="text-sm font-medium text-ink tabular-nums shrink-0 w-20 text-right">
        {formatTime(item.time)}
      </span>

      {/* Title + secondary */}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink truncate">{item.title}</div>
        {secondary.length > 0 && (
          <div className="text-xs text-ink-faint truncate mt-0.5">{secondary.join(' · ')}</div>
        )}
      </div>

      {/* Vendor tag */}
      {vendorLabel && (
        <span className="text-xs px-2 py-0.5 rounded shrink-0 bg-bg-tint text-ink-soft border border-accent-soft hidden sm:inline">
          {vendorLabel}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={onEdit} className="text-xs text-ink-faint hover:text-ink px-1.5 py-1 transition-colors" aria-label={`Edit ${item.title}`}>Edit</button>
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 px-1.5 py-1 transition-colors" aria-label={`Delete ${item.title}`}>Delete</button>
      </div>
    </li>
  );
}
