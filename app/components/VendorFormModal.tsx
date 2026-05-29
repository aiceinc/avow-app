'use client';

/**
 * VendorFormModal — add/edit a vendor. Mirrors BudgetLineItemModal /
 * GuestFormModal: the parent owns persistence; this collects + validates and
 * calls onSave. Vendors store no cost (the budget owns that).
 */

import { useState, FormEvent } from 'react';
import { Doc, Id } from '@/convex/_generated/dataModel';
import {
  VendorStatus,
  VENDOR_STATUS_OPTIONS,
  statusOf,
} from '@/app/lib/vendors';

export type VendorFormValues = {
  name: string;
  categoryId: Id<'vendorCategories'> | null;
  status: VendorStatus;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  notes: string;
};

type Category = Pick<Doc<'vendorCategories'>, '_id' | 'name'>;

export default function VendorFormModal({
  initial,
  categories,
  defaultCategoryId,
  onSave,
  onCancel,
}: {
  initial?: Doc<'vendors'> | null;
  categories: Category[];
  defaultCategoryId?: Id<'vendorCategories'>;
  onSave: (values: VendorFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState<Id<'vendorCategories'> | ''>(
    initial?.categoryId ?? defaultCategoryId ?? ''
  );
  const [status, setStatus] = useState<VendorStatus>(
    initial ? statusOf(initial) : 'researching'
  );
  const [contactName, setContactName] = useState(initial?.contactName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (email.trim() && !email.includes('@')) { setError('Enter a valid email address.'); return; }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        categoryId: categoryId || null,
        status,
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        website: website.trim(),
        notes: notes.trim(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save vendor');
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
          {editing ? 'Edit vendor' : 'Add a vendor'}
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
              placeholder="e.g. Evergreen Studios"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Category</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value as Id<'vendorCategories'> | '')}
              className="app-input w-full text-sm px-3 py-2.5"
            >
              <option value="">Uncategorized</option>
              {categories.map(c => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Status — segmented (mirrors paid-status control) */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Status</label>
            <div className="flex border border-rule rounded-lg p-1 gap-1">
              {VENDOR_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
                    status === opt.value ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact name + phone */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Contact <span className="text-ink-faint font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="e.g. Dana Reyes"
                className="app-input w-full text-sm px-3 py-2.5"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Phone <span className="text-ink-faint font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="app-input w-full text-sm px-3 py-2.5"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              Email <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="hello@evergreen.studio"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              Website <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="evergreen.studio"
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
              placeholder="e.g. Quoted for 8 hours; holds date until June 1"
              className="app-input w-full text-sm px-3 py-2.5"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="btn btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary text-sm px-4 py-2">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add a vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
