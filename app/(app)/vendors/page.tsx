'use client';

/**
 * /vendors — the Vendors module (v1.4.0).
 *
 * A flat, filterable list of vendors (status + category filters, mirroring the
 * Guest List's RSVP/side filters) with modal CRUD. Categories are managed
 * vendor "types" seeded with defaults on first visit (idempotent), add/rename/
 * delete-when-empty — mirroring the Budget Tracker.
 *
 * Vendors store no cost: the budget owns cost. Each row shows a derived,
 * read-only rollup of the budget line items that point to it (via vendorId).
 * Real-time via Convex useQuery.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc, Id } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import ConfirmModal from '@/app/components/ConfirmModal';
import VendorFormModal, { VendorFormValues } from '@/app/components/VendorFormModal';
import { VendorStatus, VENDOR_STATUS_OPTIONS, statusOf, vendorStatusStyle } from '@/app/lib/vendors';
import { formatMoney } from '@/app/lib/budget';

type SortKey = 'name-asc' | 'name-desc';

// Rollup of budget line items linked to a vendor (derived, read-only).
type Rollup = { count: number; estimated: number; actual: number };

export default function VendorsPage() {
  const { workspaceId } = useWorkspace();

  const vendors    = useQuery(api.vendors.listVendors,   { workspaceId });
  const categories = useQuery(api.vendors.listCategories, { workspaceId });
  const lineItems  = useQuery(api.budget.listLineItems,  { workspaceId }) ?? [];

  const seedDefaults   = useMutation(api.vendors.seedDefaultCategories);
  const addCategory    = useMutation(api.vendors.addCategory);
  const renameCategory = useMutation(api.vendors.renameCategory);
  const removeCategory = useMutation(api.vendors.removeCategory);
  const addVendor      = useMutation(api.vendors.addVendor);
  const updateVendor   = useMutation(api.vendors.updateVendor);
  const removeVendor   = useMutation(api.vendors.removeVendor);

  // Seed default categories on first visit (idempotent server-side too).
  const seededRef = useRef(false);
  useEffect(() => {
    if (categories !== undefined && categories.length === 0 && !seededRef.current) {
      seededRef.current = true;
      seedDefaults({ workspaceId });
    }
  }, [categories, workspaceId, seedDefaults]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories ?? []) m.set(c._id, c.name);
    return m;
  }, [categories]);

  // vendorId → linked budget rollup
  const rollupByVendor = useMemo(() => {
    const m = new Map<string, Rollup>();
    for (const item of lineItems) {
      if (!item.vendorId) continue;
      const r = m.get(item.vendorId) ?? { count: 0, estimated: 0, actual: 0 };
      r.count += 1;
      r.estimated += item.estimatedCost;
      r.actual += item.actualCost ?? 0;
      m.set(item.vendorId, r);
    }
    return m;
  }, [lineItems]);

  // How many vendors use each category (for the delete-when-empty guard).
  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vendors ?? []) {
      if (v.categoryId) m.set(v.categoryId, (m.get(v.categoryId) ?? 0) + 1);
    }
    return m;
  }, [vendors]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [sort, setSort]                 = useState<SortKey>('name-asc');
  const [statusFilter, setStatusFilter] = useState<VendorStatus | 'all'>('all');
  const [catFilter, setCatFilter]       = useState<Id<'vendorCategories'> | 'all' | 'none'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<Doc<'vendors'> | null>(null);
  const [deleting, setDeleting] = useState<Doc<'vendors'> | null>(null);

  const [managingCats, setManagingCats] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [renamingId, setRenamingId] = useState<Id<'vendorCategories'> | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const visible = useMemo(() => {
    let list = vendors ? [...vendors] : [];
    if (statusFilter !== 'all') list = list.filter(v => statusOf(v) === statusFilter);
    if (catFilter === 'none') list = list.filter(v => !v.categoryId);
    else if (catFilter !== 'all') list = list.filter(v => v.categoryId === catFilter);
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'name-desc') list.reverse();
    return list;
  }, [vendors, statusFilter, catFilter, sort]);

  // ── Vendor handlers ───────────────────────────────────────────────────────
  function openAdd() { setEditing(null); setFormOpen(true); }
  function openEdit(v: Doc<'vendors'>) { setEditing(v); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditing(null); }

  async function handleSave(values: VendorFormValues) {
    if (editing) {
      await updateVendor({
        vendorId: editing._id,
        name: values.name,
        categoryId: values.categoryId,
        status: values.status,
        contactName: values.contactName,
        email: values.email,
        phone: values.phone,
        website: values.website,
        notes: values.notes,
      });
    } else {
      await addVendor({
        workspaceId,
        name: values.name,
        categoryId: values.categoryId ?? undefined,
        status: values.status,
        contactName: values.contactName || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        website: values.website || undefined,
        notes: values.notes || undefined,
      });
    }
    closeForm();
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    await removeVendor({ vendorId: deleting._id });
    setDeleting(null);
  }

  // ── Category handlers (mirror Budget) ────────────────────────────────────────
  async function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) { setAddingCategory(false); return; }
    await addCategory({ workspaceId, name });
    setNewCatName('');
    setAddingCategory(false);
  }
  function startRename(cat: Doc<'vendorCategories'>) {
    setRenamingId(cat._id);
    setRenameValue(cat.name);
  }
  async function commitRename() {
    if (renamingId && renameValue.trim()) {
      await renameCategory({ categoryId: renamingId, name: renameValue.trim() });
    }
    setRenamingId(null);
  }
  function confirmDeleteCategory(cat: Doc<'vendorCategories'>) {
    setConfirm({
      message: `Delete the "${cat.name}" category?`,
      onConfirm: async () => { await removeCategory({ categoryId: cat._id }); setConfirm(null); },
    });
  }

  const loading = vendors === undefined || categories === undefined;
  const total = vendors?.length ?? 0;
  const booked = (vendors ?? []).filter(v => statusOf(v) === 'booked').length;
  const isEmpty = !loading && total === 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-serif text-2xl text-ink">Vendors</h1>
            <p className="text-sm text-ink-faint mt-0.5">
              {total} vendor{total !== 1 ? 's' : ''} · {booked} booked
            </p>
          </div>
          {!isEmpty && (
            <button onClick={openAdd} className="btn btn-primary text-sm px-4 py-2">
              + Add vendor
            </button>
          )}
        </div>

        {loading && (
          <p className="text-sm text-ink-faint py-16 text-center">Loading vendors…</p>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="border border-dashed border-rule rounded-xl py-16 text-center animate-fade-in">
            <h2 className="font-serif text-xl text-ink mb-2">Add your first vendor</h2>
            <p className="text-sm text-ink-soft mb-5 max-w-sm mx-auto">
              Keep caterers, photographers, florists, and venues in one place — with contacts,
              status, and a link to your budget.
            </p>
            <button onClick={openAdd} className="btn btn-primary text-sm px-4 py-2">
              + Add vendor
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
                <span className="text-ink-faint mr-1">Status</span>
                <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterPill>
                {VENDOR_STATUS_OPTIONS.map(o => (
                  <FilterPill key={o.value} active={statusFilter === o.value} onClick={() => setStatusFilter(o.value)}>
                    {o.label}
                  </FilterPill>
                ))}
              </div>

              <label className="flex items-center gap-1.5 text-ink-faint">
                Category
                <select
                  value={catFilter}
                  onChange={e => setCatFilter(e.target.value as Id<'vendorCategories'> | 'all' | 'none')}
                  className="app-input text-xs px-2 py-1 max-w-[10rem]"
                >
                  <option value="all">All</option>
                  {(categories ?? []).map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                  <option value="none">Uncategorized</option>
                </select>
              </label>

              <button
                onClick={() => setManagingCats(m => !m)}
                className="text-ink-faint hover:text-ink-soft transition-colors ml-auto"
              >
                {managingCats ? 'Done' : 'Manage categories'}
              </button>
            </div>

            {/* Category manager (collapsible) */}
            {managingCats && categories && (
              <div className="border border-rule rounded-xl bg-white/60 p-3 mb-3 animate-fade-in">
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => {
                    const used = countByCat.get(cat._id) ?? 0;
                    return (
                      <div key={cat._id} className="flex items-center gap-1 border border-rule rounded-full pl-3 pr-1.5 py-1 text-xs bg-white">
                        {renamingId === cat._id ? (
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                            className="app-input text-xs px-1.5 py-0.5 w-28"
                          />
                        ) : (
                          <button onClick={() => startRename(cat)} className="text-ink-soft hover:text-ink transition-colors" aria-label={`Rename ${cat.name}`}>
                            {cat.name}
                            {used > 0 && <span className="text-ink-faint ml-1">({used})</span>}
                          </button>
                        )}
                        {used === 0 && renamingId !== cat._id && (
                          <button
                            onClick={() => confirmDeleteCategory(cat)}
                            className="text-ink-faint hover:text-red-600 transition-colors w-4 h-4 leading-none"
                            aria-label={`Delete ${cat.name}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {addingCategory ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCatName(''); } }}
                        placeholder="Category name"
                        className="app-input text-xs px-2 py-1 w-32"
                      />
                      <button onClick={handleAddCategory} className="btn btn-primary text-xs px-2 py-1">Add</button>
                      <button onClick={() => { setAddingCategory(false); setNewCatName(''); }} className="btn btn-secondary text-xs px-2 py-1">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingCategory(true)} className="border border-dashed border-rule rounded-full px-3 py-1 text-xs text-ink-faint hover:border-accent hover:text-ink-soft transition-colors">
                      + Category
                    </button>
                  )}
                </div>
                <p className="text-xs text-ink-faint mt-2">Categories with vendors can&apos;t be deleted — recategorize those vendors first.</p>
              </div>
            )}

            {visible.length === 0 ? (
              <p className="text-sm text-ink-faint py-12 text-center">No vendors match these filters.</p>
            ) : (
              <ul className="border border-rule rounded-xl overflow-hidden bg-white/60">
                {visible.map(v => (
                  <VendorRow
                    key={v._id}
                    vendor={v}
                    categoryName={v.categoryId ? catName.get(v.categoryId) : undefined}
                    rollup={rollupByVendor.get(v._id)}
                    onEdit={() => openEdit(v)}
                    onDelete={() => setDeleting(v)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {formOpen && categories && (
        <VendorFormModal
          initial={editing}
          categories={categories}
          defaultCategoryId={catFilter !== 'all' && catFilter !== 'none' ? catFilter : undefined}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}

      {deleting && (
        <ConfirmModal
          message={
            (rollupByVendor.get(deleting._id)?.count ?? 0) > 0
              ? `Delete ${deleting.name}? Budget line items linked to them will keep the name as plain text and lose the link.`
              : `Delete ${deleting.name}?`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {confirm && (
        <ConfirmModal
          message={confirm.message}
          confirmLabel="Delete"
          destructive
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function VendorRow({
  vendor,
  categoryName,
  rollup,
  onEdit,
  onDelete,
}: {
  vendor: Doc<'vendors'>;
  categoryName?: string;
  rollup?: Rollup;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = vendorStatusStyle(statusOf(vendor));
  const contactBits = [vendor.contactName, vendor.email, vendor.phone].filter(Boolean);

  return (
    <li className="group flex items-center gap-3 px-4 py-3 border-b border-rule last:border-b-0 hover:bg-bg-tint/50 transition-colors">
      {/* Category tag */}
      <span className="text-xs font-semibold px-2 py-0.5 rounded shrink-0 bg-bg-tint text-ink-soft border border-accent-soft">
        {categoryName ?? 'Uncategorized'}
      </span>

      {/* Name + contact + website */}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink truncate">{vendor.name}</div>
        {(contactBits.length > 0 || vendor.website) && (
          <div className="text-xs text-ink-faint truncate mt-0.5">
            {contactBits.join(' · ')}
            {contactBits.length > 0 && vendor.website && ' · '}
            {vendor.website}
          </div>
        )}
      </div>

      {/* Linked budget rollup (derived, read-only) */}
      {rollup && rollup.count > 0 && (
        <span className="text-xs text-ink-faint tabular-nums shrink-0 hidden sm:inline">
          {formatMoney(rollup.actual > 0 ? rollup.actual : rollup.estimated)}
          {rollup.actual > 0 ? ' actual' : ' est'}
          <span className="text-ink-faint"> · {rollup.count} item{rollup.count !== 1 ? 's' : ''}</span>
        </span>
      )}

      {/* Status */}
      <span className={`flex items-center gap-1.5 text-xs shrink-0 w-24 ${status.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={onEdit} className="text-xs text-ink-faint hover:text-ink px-1.5 py-1 transition-colors" aria-label={`Edit ${vendor.name}`}>Edit</button>
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 px-1.5 py-1 transition-colors" aria-label={`Delete ${vendor.name}`}>Delete</button>
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
