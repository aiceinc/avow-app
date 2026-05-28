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
