/**
 * vendors.ts — shared vendor status display helpers for the Vendors module.
 *
 * Mirrors the styling helpers in guests.ts (RSVP) and budget.ts (paid status)
 * so status dots/labels render consistently across the app.
 */

export type VendorStatus = 'researching' | 'contacted' | 'booked' | 'declined';

export const VENDOR_STATUS_OPTIONS: { value: VendorStatus; label: string }[] = [
  { value: 'researching', label: 'Researching' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'booked', label: 'Booked' },
  { value: 'declined', label: 'Declined' },
];

/** Read a vendor's status defensively, treating anything unknown as "researching". */
export function statusOf(vendor: { status?: string }): VendorStatus {
  const s = vendor.status;
  if (s === 'researching' || s === 'contacted' || s === 'booked' || s === 'declined') return s;
  return 'researching';
}

export type VendorStatusStyle = { label: string; dot: string; text: string };

/**
 * Filled-pill colour variant, used by the dashboard's Vendors card. The Vendors
 * list itself uses the dot + label variant below. Both variants live here so the
 * two surfaces can't drift apart (the dashboard previously carried its own
 * private copy with slightly different colours).
 */
export function vendorStatusPill(status: VendorStatus): string {
  switch (status) {
    case 'booked':    return 'bg-emerald-50 text-emerald-800';
    case 'contacted': return 'bg-amber-50 text-amber-800';
    case 'declined':  return 'bg-rose-50 text-rose-700';
    default:          return 'bg-bg-tint text-ink-soft';
  }
}

export function vendorStatusStyle(status: VendorStatus): VendorStatusStyle {
  switch (status) {
    case 'booked':
      return { label: 'Booked', dot: 'bg-emerald-500', text: 'text-emerald-700' };
    case 'contacted':
      return { label: 'Contacted', dot: 'bg-amber-500', text: 'text-amber-700' };
    case 'declined':
      return { label: 'Declined', dot: 'bg-rose-500', text: 'text-rose-700' };
    default:
      return { label: 'Researching', dot: 'bg-gray-300', text: 'text-ink-faint' };
  }
}
