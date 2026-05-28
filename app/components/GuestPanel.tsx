'use client';

/**
 * GuestPanel — the right-hand sidebar showing the guest list.
 *
 * Guests are divided into two sections:
 *  - Unassigned: shown at the top, fully interactive, draggable onto canvas seats
 *  - Seated:     shown below, grayed out with strikethrough, still draggable
 *                (drag a seated guest to a different seat to move them)
 *
 * Drag mechanism: HTML5 native drag — each card is `draggable`. On dragStart,
 * the guest's ID is stored in dataTransfer so the canvas drop handler can
 * read it when the guest is released over a seat.
 */

import { Doc } from '@/convex/_generated/dataModel';

type Props = {
  guests:          Doc<'guests'>[];
  assignments:     Doc<'seatAssignments'>[];
  draggingGuestId: string | null;
  onDragStart:     (guestId: string) => void;
  onDragEnd:       () => void;
};

// Small badge colour per guest side
function sideBadge(side: string): string {
  if (side === 'Partner A') return 'bg-blue-100 text-blue-700';
  if (side === 'Partner B') return 'bg-rose-100 text-rose-700';
  return 'bg-violet-100 text-violet-700';
}

function sideLabel(side: string): string {
  if (side === 'Partner A') return 'A';
  if (side === 'Partner B') return 'B';
  return '♥';
}

function GuestCard({
  guest,
  isAssigned,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  guest:       Doc<'guests'>;
  isAssigned:  boolean;
  isDragging:  boolean;
  onDragStart: () => void;
  onDragEnd:   () => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('guestId', guest._id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={[
        'flex items-center gap-2 px-3 py-2 rounded-md border',
        'cursor-grab active:cursor-grabbing select-none transition-colors',
        isAssigned
          ? 'bg-bg-tint border-rule opacity-60'
          : 'bg-white border-rule hover:border-accent shadow-sm',
        isDragging ? 'opacity-30' : '',
      ].join(' ')}
    >
      {/* Side badge */}
      <span
        className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${sideBadge(guest.side)}`}
      >
        {sideLabel(guest.side)}
      </span>

      {/* Name */}
      <span
        className={`text-sm flex-1 min-w-0 truncate ${
          isAssigned ? 'text-ink-faint line-through' : 'text-ink-soft'
        }`}
      >
        {guest.name}
      </span>

      {/* Dietary indicator */}
      {guest.dietaryNotes && (
        <span
          className="text-xs text-orange-500 shrink-0"
          title={guest.dietaryNotes}
        >
          🍽
        </span>
      )}
    </div>
  );
}

export default function GuestPanel({
  guests,
  assignments,
  draggingGuestId,
  onDragStart,
  onDragEnd,
}: Props) {
  const assignedIds = new Set<string>(assignments.map(a => a.guestId));

  const unassigned = guests.filter(g => !assignedIds.has(g._id));
  const seated     = guests.filter(g =>  assignedIds.has(g._id));

  return (
    <div className="w-72 border-l border-rule bg-white/60 flex flex-col h-full overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-rule shrink-0">
        <h2 className="text-sm font-semibold text-ink">Guests</h2>
        <p className="text-xs text-ink-faint mt-0.5">
          {unassigned.length} unassigned · {seated.length} seated
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {guests.length === 0 && (
          <p className="text-sm text-ink-faint text-center py-10">
            No guests loaded
          </p>
        )}

        {/* Unassigned guests */}
        {unassigned.map(g => (
          <GuestCard
            key={g._id}
            guest={g}
            isAssigned={false}
            isDragging={draggingGuestId === g._id}
            onDragStart={() => onDragStart(g._id)}
            onDragEnd={onDragEnd}
          />
        ))}

        {/* Seated guests */}
        {seated.length > 0 && (
          <>
            <div className="pt-3 pb-1">
              <p className="text-xs font-medium text-ink-faint uppercase tracking-wide px-1">
                Seated ({seated.length})
              </p>
            </div>
            {seated.map(g => (
              <GuestCard
                key={g._id}
                guest={g}
                isAssigned={true}
                isDragging={draggingGuestId === g._id}
                onDragStart={() => onDragStart(g._id)}
                onDragEnd={onDragEnd}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2.5 border-t border-rule shrink-0">
        <p className="text-xs text-ink-faint">
          Drag a guest onto a seat · Click a seat to unassign
        </p>
      </div>
    </div>
  );
}
