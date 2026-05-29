'use client';

/**
 * BudgetLineItemModal — add/edit a budget line item. Mirrors GuestFormModal:
 * the parent owns persistence; this collects + validates and calls onSave.
 *
 * Money fields are whole dollars (parsed/rounded on save). The "Amount paid"
 * field only appears when Paid status is "Partial".
 */

import { useState, FormEvent } from 'react';
import { Doc, Id } from '@/convex/_generated/dataModel';
import { PaidStatus, PAID_STATUS_OPTIONS, parseMoney } from '@/app/lib/budget';

export type LineItemFormValues = {
  categoryId: Id<'budgetCategories'>;
  name: string;
  estimatedCost: number;
  actualCost: number | null;
  paidStatus: PaidStatus;
  amountPaid: number | null;
  notes: string;
  vendorId: Id<'vendors'> | null;
};

type Category = Pick<Doc<'budgetCategories'>, '_id' | 'name'>;
type Vendor = Pick<Doc<'vendors'>, '_id' | 'name'>;

export default function BudgetLineItemModal({
  initial,
  categories,
  vendors,
  defaultCategoryId,
  onSave,
  onCancel,
}: {
  initial?: Doc<'budgetLineItems'> | null;
  categories: Category[];
  vendors: Vendor[];
  defaultCategoryId?: Id<'budgetCategories'>;
  onSave: (values: LineItemFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = !!initial;

  const [categoryId, setCategoryId] = useState<Id<'budgetCategories'> | ''>(
    initial?.categoryId ?? defaultCategoryId ?? categories[0]?._id ?? ''
  );
  const [name, setName]               = useState(initial?.name ?? '');
  const [estimated, setEstimated]     = useState(initial ? String(initial.estimatedCost) : '');
  const [actual, setActual]           = useState(initial?.actualCost != null ? String(initial.actualCost) : '');
  const [paidStatus, setPaidStatus]   = useState<PaidStatus>(initial?.paidStatus ?? 'unpaid');
  const [amountPaid, setAmountPaid]   = useState(initial?.amountPaid != null ? String(initial.amountPaid) : '');
  const [notes, setNotes]             = useState(initial?.notes ?? '');
  const [vendorId, setVendorId]       = useState<Id<'vendors'> | ''>(initial?.vendorId ?? '');
  const [saving, setSaving] = useState(false);

  // Legacy free-text vendor on pre-v1.4.0 items that were never linked.
  const legacyVendor = initial && !initial.vendorId ? initial.vendor : undefined;
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId) { setError('Pick a category.'); return; }
    if (!name.trim()) { setError('Name is required.'); return; }
    const estimatedCost = parseMoney(estimated);
    if (estimatedCost === null) { setError('Estimated cost is required.'); return; }
    const actualCost = parseMoney(actual);

    let paidValue: number | null = null;
    if (paidStatus === 'partial') {
      paidValue = parseMoney(amountPaid);
      if (paidValue === null) { setError('Enter the amount paid so far.'); return; }
      if (actualCost !== null && paidValue >= actualCost) {
        setError('Amount paid should be less than the actual cost (use "Paid" if fully paid).');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        categoryId,
        name: name.trim(),
        estimatedCost,
        actualCost,
        paidStatus,
        amountPaid: paidValue,
        notes: notes.trim(),
        vendorId: vendorId || null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save line item');
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
          {editing ? 'Edit line item' : 'Add a line item'}
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
              placeholder="e.g. Photographer deposit"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Category</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value as Id<'budgetCategories'>)}
              className="app-input w-full text-sm px-3 py-2.5"
            >
              {categories.map(c => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Estimated + Actual */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink-soft mb-1">Estimated cost</label>
              <input
                type="text"
                inputMode="numeric"
                value={estimated}
                onChange={e => setEstimated(e.target.value)}
                placeholder="$0"
                className="app-input w-full text-sm px-3 py-2.5 tabular-nums"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Actual cost <span className="text-ink-faint font-normal">(optional)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={actual}
                onChange={e => setActual(e.target.value)}
                placeholder="—"
                className="app-input w-full text-sm px-3 py-2.5 tabular-nums"
              />
            </div>
          </div>

          {/* Paid status — segmented */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Paid status</label>
            <div className="flex border border-rule rounded-lg p-1 gap-1">
              {PAID_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaidStatus(opt.value)}
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
                    paidStatus === opt.value ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {paidStatus === 'partial' && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-ink-soft mb-1">Amount paid so far</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  placeholder="$0"
                  className="app-input w-full text-sm px-3 py-2.5 tabular-nums"
                />
              </div>
            )}
          </div>

          {/* Vendor — picker (linked to the Vendors module) */}
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
            {legacyVendor && !vendorId && (
              <p className="text-xs text-ink-faint mt-1">
                Previously entered: “{legacyVendor}” — pick the matching vendor to link it.
              </p>
            )}
            {vendors.length === 0 && (
              <p className="text-xs text-ink-faint mt-1">
                Add vendors in the Vendors tab to link them here.
              </p>
            )}
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
              placeholder="e.g. Includes 8 hours of coverage"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="btn btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary text-sm px-4 py-2">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add a line item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
