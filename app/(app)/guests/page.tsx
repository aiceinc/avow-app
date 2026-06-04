'use client';

/**
 * /guests — the Guest List module (default landing tab).
 *
 * Source of truth for guest data across the app: the seating planner reads the
 * same `guests` table, so adds/edits/deletes here propagate to it in real time
 * via Convex. Supports add/edit (modal), delete (with seat-unassign cascade in
 * the mutation), client-side sort by name and filter by RSVP/side, and a
 * read-only "seated at" indicator joined from seatAssignments + tables.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { guestCapFor } from '@/convex/billingConfig';
import ConfirmModal from '@/app/components/ConfirmModal';
import GuestFormModal, { GuestFormValues } from '@/app/components/GuestFormModal';
import {
  sideBadgeClasses,
  sideFullLabel,
  sideOptions,
  rsvpStatusOf,
  rsvpStyle,
  RsvpStatus,
  Side,
  PartnerNames,
  RSVP_OPTIONS,
} from '@/app/lib/guests';

type SortKey = 'name-asc' | 'name-desc';

export default function GuestsPage() {
  const { workspaceId, partnerNames, entitlement } = useWorkspace();

  const guests      = useQuery(api.guests.list,          { workspaceId });
  const assignments = useQuery(api.seatAssignments.list, { workspaceId }) ?? [];
  const tables      = useQuery(api.tables.list,          { workspaceId }) ?? [];

  const createGuest = useMutation(api.guests.create);
  const updateGuest = useMutation(api.guests.update);
  const removeGuest = useMutation(api.guests.remove);

  const [sort, setSort]             = useState<SortKey>('name-asc');
  const [rsvpFilter, setRsvpFilter] = useState<RsvpStatus | 'all'>('all');
  const [sideFilter, setSideFilter] = useState<Side | 'all'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<Doc<'guests'> | null>(null);
  const [deleting, setDeleting] = useState<Doc<'guests'> | null>(null);

  // guestId → the label of the table they're seated at (read-only indicator)
  const seatByGuest = useMemo(() => {
    const labelByTable = new Map(tables.map(t => [t._id as string, t.label?.trim() || 'a table']));
    const m = new Map<string, string>();
    for (const a of assignments) m.set(a.guestId, labelByTable.get(a.tableId) ?? 'a table');
    return m;
  }, [assignments, tables]);

  const visible = useMemo(() => {
    let list = guests ? [...guests] : [];
    if (rsvpFilter !== 'all') list = list.filter(g => rsvpStatusOf(g) === rsvpFilter);
    if (sideFilter !== 'all') list = list.filter(g => g.side === sideFilter);
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'name-desc') list.reverse();
    return list;
  }, [guests, rsvpFilter, sideFilter, sort]);

  function openAdd() { setEditing(null); setFormOpen(true); }
  function openEdit(g: Doc<'guests'>) { setEditing(g); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditing(null); }

  async function handleSave(values: GuestFormValues) {
    if (editing) {
      await updateGuest({
        guestId: editing._id,
        name: values.name,
        side: values.side,
        rsvpStatus: values.rsvpStatus,
        dietaryNotes: values.dietaryNotes,
        hasPlusOne: values.hasPlusOne,
        plusOneName: values.plusOneName,
      });
    } else {
      await createGuest({
        workspaceId,
        name: values.name,
        side: values.side,
        rsvpStatus: values.rsvpStatus,
        dietaryNotes: values.dietaryNotes || undefined,
        hasPlusOne: values.hasPlusOne,
        plusOneName: values.hasPlusOne ? values.plusOneName || undefined : undefined,
      });
    }
    closeForm();
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    await removeGuest({ guestId: deleting._id });
    setDeleting(null);
  }

  const loading = guests === undefined;
  const total = guests?.length ?? 0;
  const attending = (guests ?? []).filter(g => rsvpStatusOf(g) === 'yes').length;
  const isEmpty = !loading && total === 0;

  // Per-tier guest cap (Standard / free trial = 100; Pro & Planner unlimited).
  const cap = entitlement.tier ? guestCapFor(entitlement.tier) : null;
  const atCap = cap !== null && total >= cap;
  const canAdd = entitlement.canEdit && !atCap;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-serif text-2xl text-ink">Guest List</h1>
            <p className="text-sm text-ink-faint mt-0.5">
              {total} guest{total !== 1 ? 's' : ''} · {attending} attending
            </p>
          </div>
          {!isEmpty && (
            <button
              onClick={openAdd}
              disabled={!canAdd}
              title={atCap ? `Your plan is limited to ${cap} guests` : undefined}
              className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add a guest
            </button>
          )}
        </div>

        {atCap && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-ink-soft flex items-center justify-between gap-3">
            <span>You&rsquo;ve reached the <strong>{cap}-guest</strong> limit on your plan. Upgrade to Pro for unlimited guests.</span>
            <Link href="/account" className="shrink-0 underline font-medium hover:opacity-80">Upgrade &rarr;</Link>
          </div>
        )}

        {loading && (
          <p className="text-sm text-ink-faint py-16 text-center">Loading guests…</p>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="border border-dashed border-rule rounded-xl py-16 text-center animate-fade-in">
            <h2 className="font-serif text-xl text-ink mb-2">Let&apos;s add your first guest</h2>
            <p className="text-sm text-ink-soft mb-5 max-w-sm mx-auto">
              Build your guest list here — it powers your seating chart and the rest of your planning.
            </p>
            <button
              onClick={openAdd}
              disabled={!entitlement.canEdit}
              className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add a guest
            </button>
          </div>
        )}

        {/* Controls + list */}
        {!loading && !isEmpty && (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-xs">
              <label className="flex items-center gap-1.5 text-ink-faint">
                Sort
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                  className="app-input text-xs px-2 py-1"
                >
                  <option value="name-asc">Name (A–Z)</option>
                  <option value="name-desc">Name (Z–A)</option>
                </select>
              </label>

              <div className="flex items-center gap-1">
                <span className="text-ink-faint mr-1">RSVP</span>
                <FilterPill active={rsvpFilter === 'all'} onClick={() => setRsvpFilter('all')}>All</FilterPill>
                {RSVP_OPTIONS.map(o => (
                  <FilterPill key={o.value} active={rsvpFilter === o.value} onClick={() => setRsvpFilter(o.value)}>
                    {o.label}
                  </FilterPill>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-ink-faint mr-1">Side</span>
                <FilterPill active={sideFilter === 'all'} onClick={() => setSideFilter('all')}>All</FilterPill>
                {sideOptions(partnerNames).map(o => (
                  <FilterPill key={o.value} active={sideFilter === o.value} onClick={() => setSideFilter(o.value)}>
                    {o.label}
                  </FilterPill>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-ink-faint py-12 text-center">No guests match these filters.</p>
            ) : (
              <ul className="border border-rule rounded-xl overflow-hidden bg-white/60">
                {visible.map(g => (
                  <GuestRow
                    key={g._id}
                    guest={g}
                    partnerNames={partnerNames}
                    seatedAt={seatByGuest.get(g._id)}
                    onEdit={() => openEdit(g)}
                    onDelete={() => setDeleting(g)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {formOpen && (
        <GuestFormModal initial={editing} onSave={handleSave} onCancel={closeForm} />
      )}

      {deleting && (
        <ConfirmModal
          message={`Delete ${deleting.name}? This also removes them from any seat they're assigned to.`}
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

function GuestRow({
  guest,
  partnerNames,
  seatedAt,
  onEdit,
  onDelete,
}: {
  guest: Doc<'guests'>;
  partnerNames: PartnerNames;
  seatedAt?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rsvp = rsvpStyle(rsvpStatusOf(guest));

  return (
    <li className="group flex items-center gap-3 px-4 py-3 border-b border-rule last:border-b-0 hover:bg-bg-tint/50 transition-colors">
      {/* Side tag */}
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${sideBadgeClasses(guest.side)}`}
      >
        {sideFullLabel(guest.side, partnerNames)}
      </span>

      {/* Name + plus-one + dietary */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink truncate">{guest.name}</span>
          {guest.hasPlusOne && (
            <span className="text-xs bg-bg-tint border border-accent-soft text-ink-soft px-1.5 py-0.5 rounded shrink-0">
              +1{guest.plusOneName ? ` · ${guest.plusOneName}` : ''}
            </span>
          )}
        </div>
        {guest.dietaryNotes && (
          <div className="text-xs text-ink-faint mt-0.5 truncate">🍽 {guest.dietaryNotes}</div>
        )}
      </div>

      {/* Seated indicator (read-only) */}
      {seatedAt && (
        <span className="text-xs text-ink-faint shrink-0 hidden sm:inline">Seated · {seatedAt}</span>
      )}

      {/* RSVP */}
      <span className={`flex items-center gap-1.5 text-xs shrink-0 w-16 ${rsvp.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${rsvp.dot}`} />
        {rsvp.label}
      </span>

      {/* Actions — appear on hover/focus */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="text-xs text-ink-faint hover:text-ink px-1.5 py-1 transition-colors"
          aria-label={`Edit ${guest.name}`}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-red-500 hover:text-red-700 px-1.5 py-1 transition-colors"
          aria-label={`Delete ${guest.name}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function FilterPill({
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
