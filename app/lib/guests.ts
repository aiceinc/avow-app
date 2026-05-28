/**
 * guests.ts — shared guest display helpers.
 *
 * Centralises Side and RSVP styling so the Guest List module and the seating
 * planner's side panel render identical colors and labels (per the brief:
 * "keep colors identical across modules").
 */

export type Side = 'Partner A' | 'Partner B' | 'both';
export type RsvpStatus = 'pending' | 'yes' | 'no' | 'maybe';

// ── Side (Partner A / Partner B / Both) ─────────────────────────────────────

/** Tailwind classes for a side badge background + text. */
export function sideBadgeClasses(side: string): string {
  if (side === 'Partner A') return 'bg-blue-100 text-blue-700';
  if (side === 'Partner B') return 'bg-rose-100 text-rose-700';
  return 'bg-violet-100 text-violet-700';
}

/** Compact one-glyph label used on tight badges (seating panel). */
export function sideShortLabel(side: string): string {
  if (side === 'Partner A') return 'A';
  if (side === 'Partner B') return 'B';
  return '♥';
}

/** Human-readable label used where there's room (guest list, forms). */
export function sideFullLabel(side: string): string {
  if (side === 'Partner A') return 'Partner A';
  if (side === 'Partner B') return 'Partner B';
  return 'Both';
}

export const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: 'Partner A', label: 'Partner A' },
  { value: 'Partner B', label: 'Partner B' },
  { value: 'both', label: 'Both' },
];

// ── RSVP status ──────────────────────────────────────────────────────────────

/** Read a guest's RSVP, treating missing (pre-v1.2.0 guests) as "pending". */
export function rsvpStatusOf(guest: { rsvpStatus?: string }): RsvpStatus {
  const s = guest.rsvpStatus;
  if (s === 'yes' || s === 'no' || s === 'maybe' || s === 'pending') return s;
  return 'pending';
}

export type RsvpStyle = { label: string; dot: string; text: string };

export function rsvpStyle(status: RsvpStatus): RsvpStyle {
  switch (status) {
    case 'yes':
      return { label: 'Yes', dot: 'bg-emerald-500', text: 'text-emerald-700' };
    case 'no':
      return { label: 'No', dot: 'bg-rose-500', text: 'text-rose-700' };
    case 'maybe':
      return { label: 'Maybe', dot: 'bg-amber-500', text: 'text-amber-700' };
    default:
      return { label: 'Pending', dot: 'bg-gray-300', text: 'text-ink-faint' };
  }
}

export const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'maybe', label: 'Maybe' },
];
