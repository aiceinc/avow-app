/**
 * budget.ts — money formatting + budget math helpers for the Budget Tracker.
 * Amounts are whole dollars throughout (see schema / brief Part 1.1).
 */

import { Doc } from '@/convex/_generated/dataModel';

export type PaidStatus = 'unpaid' | 'paid' | 'partial';

export const PAID_STATUS_OPTIONS: { value: PaidStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
];

/** "$30,000" — whole dollars with thousands separators, no decimals. */
export function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Parse a money input string to a non-negative whole number, or null if blank. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

/**
 * A category-appropriate example for the line-item "name" placeholder. Keyed on
 * the standard seeded budget categories (see convex/budget.ts DEFAULT_CATEGORIES);
 * falls back to a generic example for custom or renamed categories.
 */
const LINE_ITEM_EXAMPLES: Record<string, string> = {
  'venue': 'Reception hall deposit',
  'catering & bar': 'Plated dinner for 100',
  'photography & video': 'Photographer — 8-hour package',
  'attire & beauty': 'Wedding dress',
  'flowers & decor': 'Bridal bouquet',
  'music & entertainment': 'DJ for the reception',
  'stationery': 'Invitations & save-the-dates',
  'rings': 'Wedding bands',
  'transportation': 'Guest shuttle service',
  'gifts & favors': 'Welcome bags',
  'miscellaneous': 'Marriage license',
};

export function lineItemNameExample(categoryName?: string): string {
  const key = categoryName?.trim().toLowerCase();
  const example = (key && LINE_ITEM_EXAMPLES[key]) || 'Photographer deposit';
  return `e.g. ${example}`;
}

/** How much has actually been paid on a line item. */
export function paidAmount(item: Doc<'budgetLineItems'>): number {
  if (item.paidStatus === 'partial') return item.amountPaid ?? 0;
  if (item.paidStatus === 'paid') return item.actualCost ?? item.estimatedCost;
  return 0;
}

export type Totals = { estimated: number; actual: number; paid: number };

/** Sum estimated / actual / paid across a set of line items. */
export function sumTotals(items: Doc<'budgetLineItems'>[]): Totals {
  return items.reduce<Totals>(
    (acc, item) => ({
      estimated: acc.estimated + item.estimatedCost,
      actual: acc.actual + (item.actualCost ?? 0),
      paid: acc.paid + paidAmount(item),
    }),
    { estimated: 0, actual: 0, paid: 0 }
  );
}

export type PaidStyle = { label: string; dot: string; text: string };

export function paidStatusStyle(status: PaidStatus): PaidStyle {
  switch (status) {
    case 'paid':
      return { label: 'Paid', dot: 'bg-emerald-500', text: 'text-emerald-700' };
    case 'partial':
      return { label: 'Partial', dot: 'bg-amber-500', text: 'text-amber-700' };
    default:
      return { label: 'Unpaid', dot: 'bg-gray-300', text: 'text-ink-faint' };
  }
}
