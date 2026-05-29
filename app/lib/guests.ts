/**
 * guests.ts — shared guest display helpers.
 *
 * Centralises Side and RSVP styling so the Guest List module and the seating
 * planner's side panel render identical colors and labels (per the brief:
 * "keep colors identical across modules").
 */

export type Side = 'Partner A' | 'Partner B' | 'both';
export type RsvpStatus = 'pending' | 'yes' | 'no' | 'maybe';

// ── Side (the two partners / Both) ──────────────────────────────────────────
// The stored side values stay "Partner A" / "Partner B" / "both" (see schema).
// Display labels become the couple's first names when we can derive them — see
// derivePartnerNames — falling back to the generic "Partner A" / "Partner B".

export type PartnerNames = { a: string; b: string };

/**
 * Derive the two partners' display names from the workspace name (the wedding
 * plan name chosen at the start, e.g. "Alex & Jordan's Wedding" → Alex / Jordan).
 * Strips a trailing "…'s Wedding" / "Wedding" and splits on & / "and" / + / "/".
 * Falls back to the generic "Partner A" / "Partner B" when two names can't be
 * confidently extracted (e.g. "The Smiths", "Our Wedding").
 */
export function derivePartnerNames(workspaceName: string): PartnerNames {
  const cleaned = workspaceName
    .trim()
    .replace(/[''’]s\s+wedding\s*$/i, '')
    .replace(/\s+wedding\s*$/i, '')
    .trim();
  const parts = cleaned
    .split(/\s*(?:&|\+|\/|\band\b)\s*/i)
    .map((p) => p.replace(/[''’]s$/i, '').trim())
    .filter(Boolean);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { a: parts[0], b: parts[1] };
  }
  return { a: 'Partner A', b: 'Partner B' };
}

/** Tailwind classes for a side badge background + text. */
export function sideBadgeClasses(side: string): string {
  if (side === 'Partner A') return 'bg-blue-100 text-blue-700';
  if (side === 'Partner B') return 'bg-rose-100 text-rose-700';
  return 'bg-violet-100 text-violet-700';
}

/** First initial of a partner's name; A/B for the generic fallback. */
function partnerInitial(name: string | undefined, fallback: 'A' | 'B'): string {
  if (!name || name === 'Partner A' || name === 'Partner B') return fallback;
  return name.charAt(0).toUpperCase();
}

/** Compact one-glyph label used on tight badges (seating panel). */
export function sideShortLabel(side: string, names?: PartnerNames): string {
  if (side === 'Partner A') return partnerInitial(names?.a, 'A');
  if (side === 'Partner B') return partnerInitial(names?.b, 'B');
  return '♥';
}

/** Human-readable label used where there's room (guest list, forms). */
export function sideFullLabel(side: string, names?: PartnerNames): string {
  if (side === 'Partner A') return names?.a || 'Partner A';
  if (side === 'Partner B') return names?.b || 'Partner B';
  return 'Both';
}

/** Side options for selects / segmented controls, labelled with the couple's names. */
export function sideOptions(names?: PartnerNames): { value: Side; label: string }[] {
  return [
    { value: 'Partner A', label: names?.a || 'Partner A' },
    { value: 'Partner B', label: names?.b || 'Partner B' },
    { value: 'both', label: 'Both' },
  ];
}

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
