'use client';

/**
 * /budget — the Budget Tracker module.
 *
 * Target budget + a summary stat strip (estimated / actual / paid / remaining,
 * with a gold "over budget" treatment), and line items grouped into collapsible
 * categories with subtotals. Categories are seeded with 11 defaults on first
 * visit (idempotent). Real-time via Convex useQuery, like Guest List.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc, Id } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import ConfirmModal from '@/app/components/ConfirmModal';
import BudgetLineItemModal, { LineItemFormValues } from '@/app/components/BudgetLineItemModal';
import {
  formatMoney,
  parseMoney,
  paidStatusStyle,
  sumTotals,
} from '@/app/lib/budget';

export default function BudgetPage() {
  const { workspaceId } = useWorkspace();

  const settings   = useQuery(api.budget.getSettings,    { workspaceId });
  const categories = useQuery(api.budget.listCategories, { workspaceId });
  const lineItems  = useQuery(api.budget.listLineItems,  { workspaceId }) ?? [];

  const seedDefaults  = useMutation(api.budget.seedDefaultCategories);
  const setTarget     = useMutation(api.budget.setTarget);
  const addCategory   = useMutation(api.budget.addCategory);
  const renameCategory = useMutation(api.budget.renameCategory);
  const removeCategory = useMutation(api.budget.removeCategory);
  const addLineItem    = useMutation(api.budget.addLineItem);
  const updateLineItem = useMutation(api.budget.updateLineItem);
  const removeLineItem = useMutation(api.budget.removeLineItem);

  // Seed default categories on first visit (idempotent server-side too).
  const seededRef = useRef(false);
  useEffect(() => {
    if (categories !== undefined && categories.length === 0 && !seededRef.current) {
      seededRef.current = true;
      seedDefaults({ workspaceId });
    }
  }, [categories, workspaceId, seedDefaults]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const itemsByCat = useMemo(() => {
    const m = new Map<string, Doc<'budgetLineItems'>[]>();
    for (const item of lineItems) {
      const arr = m.get(item.categoryId) ?? [];
      arr.push(item);
      m.set(item.categoryId, arr);
    }
    return m;
  }, [lineItems]);

  const totals = useMemo(() => sumTotals(lineItems), [lineItems]);
  const target = settings?.targetBudget ?? null;
  const hasTarget = target !== null;
  // Remaining is measured against actuals once any exist, else against estimates.
  const basis = totals.actual > 0 ? totals.actual : totals.estimated;
  const remaining = hasTarget ? target - basis : null;
  // Over-budget surfaces when EITHER estimated or actual exceeds the target.
  const estOver = hasTarget && totals.estimated > target;
  const actOver = hasTarget && totals.actual > target;
  const over = estOver || actOver;
  // Sub-label under "Remaining": prefer the basis overage; otherwise flag an
  // estimate that's over even while actuals are still under target.
  let remainingSub: string | undefined;
  if (hasTarget) {
    if (remaining !== null && remaining < 0) remainingSub = `Over by ${formatMoney(-remaining)}`;
    else if (estOver) remainingSub = `Estimated over by ${formatMoney(totals.estimated - target)}`;
    else remainingSub = `of ${formatMoney(target)} target`;
  }

  // ── UI state ─────────────────────────────────────────────────────────────
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Doc<'budgetLineItems'> | null>(null);
  const [defaultCatId, setDefaultCatId] = useState<Id<'budgetCategories'> | undefined>(undefined);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [renamingId, setRenamingId] = useState<Id<'budgetCategories'> | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  function isOpen(catId: string) {
    return overrides[catId] ?? (itemsByCat.get(catId)?.length ?? 0) > 0;
  }
  function toggleCat(catId: string) {
    setOverrides(o => ({ ...o, [catId]: !isOpen(catId) }));
  }

  // ── Target handlers ────────────────────────────────────────────────────────
  function openTargetEditor() {
    setTargetInput(target !== null ? String(target) : '');
    setEditingTarget(true);
  }
  async function saveTarget() {
    const value = parseMoney(targetInput);
    await setTarget({ workspaceId, targetBudget: value });
    setEditingTarget(false);
  }
  async function clearTarget() {
    await setTarget({ workspaceId, targetBudget: null });
    setEditingTarget(false);
  }

  // ── Line item handlers ──────────────────────────────────────────────────────
  function openAddItem(catId?: Id<'budgetCategories'>) {
    setEditingItem(null);
    setDefaultCatId(catId);
    setItemModalOpen(true);
  }
  function openEditItem(item: Doc<'budgetLineItems'>) {
    setEditingItem(item);
    setDefaultCatId(undefined);
    setItemModalOpen(true);
  }
  function closeItemModal() {
    setItemModalOpen(false);
    setEditingItem(null);
  }
  async function handleSaveItem(values: LineItemFormValues) {
    if (editingItem) {
      await updateLineItem({
        lineItemId: editingItem._id,
        categoryId: values.categoryId,
        name: values.name,
        estimatedCost: values.estimatedCost,
        actualCost: values.actualCost,
        paidStatus: values.paidStatus,
        amountPaid: values.amountPaid,
        notes: values.notes,
        vendor: values.vendor,
      });
    } else {
      await addLineItem({
        workspaceId,
        categoryId: values.categoryId,
        name: values.name,
        estimatedCost: values.estimatedCost,
        actualCost: values.actualCost ?? undefined,
        paidStatus: values.paidStatus,
        amountPaid: values.amountPaid ?? undefined,
        notes: values.notes || undefined,
        vendor: values.vendor || undefined,
      });
    }
    closeItemModal();
  }

  // ── Category handlers ────────────────────────────────────────────────────────
  async function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) { setAddingCategory(false); return; }
    await addCategory({ workspaceId, name });
    setNewCatName('');
    setAddingCategory(false);
  }
  function startRename(cat: Doc<'budgetCategories'>) {
    setRenamingId(cat._id);
    setRenameValue(cat.name);
  }
  async function commitRename() {
    if (renamingId && renameValue.trim()) {
      await renameCategory({ categoryId: renamingId, name: renameValue.trim() });
    }
    setRenamingId(null);
  }
  function confirmDeleteCategory(cat: Doc<'budgetCategories'>) {
    setConfirm({
      message: `Delete the "${cat.name}" category?`,
      onConfirm: async () => { await removeCategory({ categoryId: cat._id }); setConfirm(null); },
    });
  }
  function confirmDeleteItem(item: Doc<'budgetLineItems'>) {
    setConfirm({
      message: `Delete "${item.name}"?`,
      onConfirm: async () => { await removeLineItem({ lineItemId: item._id }); setConfirm(null); },
    });
  }

  const loading = categories === undefined || settings === undefined;
  const noItems = !loading && lineItems.length === 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-6">
        <h1 className="font-serif text-2xl text-ink mb-4">Budget</h1>

        {/* Target row */}
        <div className="mb-4">
          {editingTarget ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft">Target</span>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditingTarget(false); }}
                placeholder="$30,000"
                className="app-input text-sm px-3 py-1.5 w-36 tabular-nums"
              />
              <button onClick={saveTarget} className="btn btn-primary text-xs px-3 py-1.5">Save</button>
              <button onClick={() => setEditingTarget(false)} className="btn btn-secondary text-xs px-3 py-1.5">Cancel</button>
              {hasTarget && (
                <button onClick={clearTarget} className="text-xs text-ink-faint hover:text-red-600 transition-colors ml-1">Clear</button>
              )}
            </div>
          ) : hasTarget ? (
            <div className="flex items-baseline gap-3">
              <span className="text-sm text-ink-soft">Target</span>
              <span className="font-serif text-2xl text-ink tabular-nums">{formatMoney(target)}</span>
              <button onClick={openTargetEditor} className="text-xs text-ink-faint hover:text-ink-soft transition-colors">Edit</button>
            </div>
          ) : (
            <button onClick={openTargetEditor} className="btn btn-secondary text-sm px-4 py-2 border-accent text-accent hover:bg-bg-tint">
              Set a target budget
            </button>
          )}
        </div>

        {/* Summary strip */}
        <div className="flex flex-wrap gap-x-10 gap-y-3 border-y border-rule py-4 mb-6">
          <Stat label="Estimated" value={formatMoney(totals.estimated)} />
          <Stat label="Actual" value={formatMoney(totals.actual)} />
          <Stat label="Paid" value={formatMoney(totals.paid)} />
          {hasTarget && (
            <Stat
              label="Remaining"
              value={formatMoney(Math.abs(remaining ?? 0))}
              accent={over}
              sub={remainingSub}
              prefix={remaining !== null && remaining < 0 ? '−' : ''}
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => openAddItem()}
            disabled={!categories || categories.length === 0}
            className="btn btn-primary text-sm px-4 py-2"
          >
            + Add line item
          </button>
          {addingCategory ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCatName(''); } }}
                placeholder="Category name"
                className="app-input text-sm px-3 py-2 w-44"
              />
              <button onClick={handleAddCategory} className="btn btn-primary text-xs px-3 py-2">Add</button>
              <button onClick={() => { setAddingCategory(false); setNewCatName(''); }} className="btn btn-secondary text-xs px-3 py-2">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAddingCategory(true)} className="btn btn-secondary text-sm px-3 py-2">+ Category</button>
          )}
        </div>

        {loading && <p className="text-sm text-ink-faint py-16 text-center">Loading budget…</p>}

        {/* Empty-state banner */}
        {noItems && (
          <div className="border border-dashed border-rule rounded-xl py-12 text-center animate-fade-in mb-4">
            <h2 className="font-serif text-xl text-ink mb-2">No line items yet</h2>
            <p className="text-sm text-ink-soft mb-5 max-w-sm mx-auto">
              Add your first line item to start tracking estimates, actuals, and payments by category.
            </p>
            <button onClick={() => openAddItem()} className="btn btn-primary text-sm px-4 py-2">+ Add line item</button>
          </div>
        )}

        {/* Categories */}
        {!loading && categories && (
          <div className="space-y-2">
            {categories.map(cat => {
              const items = itemsByCat.get(cat._id) ?? [];
              const sub = sumTotals(items);
              const open = isOpen(cat._id);
              return (
                <div key={cat._id} className="border border-rule rounded-xl overflow-hidden bg-white/60">
                  {/* Category header */}
                  <div className="group flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => toggleCat(cat._id)}
                      className="text-ink-faint hover:text-ink-soft text-xs w-4 shrink-0 transition-colors"
                      aria-label={open ? 'Collapse' : 'Expand'}
                    >
                      {open ? '▾' : '▸'}
                    </button>

                    {renamingId === cat._id ? (
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                        className="app-input text-sm px-2 py-1 flex-1 max-w-xs"
                      />
                    ) : (
                      <button onClick={() => toggleCat(cat._id)} className="text-sm font-medium text-ink flex-1 text-left truncate">
                        {cat.name}
                        <span className="text-ink-faint font-normal ml-2">
                          {items.length > 0 ? `(${items.length})` : ''}
                        </span>
                      </button>
                    )}

                    {/* Subtotal */}
                    <span className="text-xs text-ink-soft tabular-nums shrink-0">
                      {formatMoney(sub.estimated)} est
                      {sub.actual > 0 && <span className="text-ink-faint"> · {formatMoney(sub.actual)} actual</span>}
                    </span>

                    {/* Hover actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => openAddItem(cat._id)} className="text-xs text-ink-faint hover:text-ink px-1.5 py-1 transition-colors" aria-label={`Add line item to ${cat.name}`}>+ Item</button>
                      <button onClick={() => startRename(cat)} className="text-xs text-ink-faint hover:text-ink px-1.5 py-1 transition-colors" aria-label={`Rename ${cat.name}`}>Rename</button>
                      {items.length === 0 && (
                        <button onClick={() => confirmDeleteCategory(cat)} className="text-xs text-red-500 hover:text-red-700 px-1.5 py-1 transition-colors" aria-label={`Delete ${cat.name}`}>Delete</button>
                      )}
                    </div>
                  </div>

                  {/* Line items */}
                  {open && (
                    <div className="border-t border-rule">
                      {items.length === 0 ? (
                        <button onClick={() => openAddItem(cat._id)} className="block w-full text-left px-4 py-3 text-xs text-ink-faint hover:bg-bg-tint/50 transition-colors">
                          No items yet — add one
                        </button>
                      ) : (
                        items.map(item => (
                          <LineItemRow
                            key={item._id}
                            item={item}
                            onEdit={() => openEditItem(item)}
                            onDelete={() => confirmDeleteItem(item)}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {itemModalOpen && categories && (
        <BudgetLineItemModal
          initial={editingItem}
          categories={categories}
          defaultCategoryId={defaultCatId}
          onSave={handleSaveItem}
          onCancel={closeItemModal}
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

// ── Summary stat ──────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  accent,
  prefix,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  prefix?: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint mb-1">{label}</div>
      <div className={`font-serif text-2xl tabular-nums ${accent ? 'text-accent' : 'text-ink'}`}>
        {prefix}{value}
      </div>
      {sub && <div className={`text-xs mt-0.5 ${accent ? 'text-accent' : 'text-ink-faint'}`}>{sub}</div>}
    </div>
  );
}

// ── Line item row ─────────────────────────────────────────────────────────────

function LineItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: Doc<'budgetLineItems'>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const paid = paidStatusStyle(item.paidStatus);
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-rule last:border-b-0 hover:bg-bg-tint/50 transition-colors">
      {/* Name + secondary */}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink truncate">{item.name}</div>
        {(item.vendor || item.notes) && (
          <div className="text-xs text-ink-faint truncate mt-0.5">
            {item.vendor && <span>{item.vendor}</span>}
            {item.vendor && item.notes && <span> · </span>}
            {item.notes && <span>{item.notes}</span>}
          </div>
        )}
      </div>

      {/* Estimated */}
      <div className="text-sm text-ink tabular-nums text-right w-24 shrink-0">{formatMoney(item.estimatedCost)}</div>

      {/* Actual */}
      <div className="text-sm tabular-nums text-right w-24 shrink-0">
        {item.actualCost != null ? (
          <span className="text-ink">{formatMoney(item.actualCost)}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </div>

      {/* Paid status */}
      <div className={`flex items-center gap-1.5 text-xs shrink-0 w-28 ${paid.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${paid.dot}`} />
        {paid.label}
        {item.paidStatus === 'partial' && item.amountPaid != null && (
          <span className="text-ink-faint">({formatMoney(item.amountPaid)})</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={onEdit} className="text-xs text-ink-faint hover:text-ink px-1.5 py-1 transition-colors" aria-label={`Edit ${item.name}`}>Edit</button>
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 px-1.5 py-1 transition-colors" aria-label={`Delete ${item.name}`}>Delete</button>
      </div>
    </div>
  );
}
