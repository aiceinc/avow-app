'use client';

/**
 * /seating — the seating planner module.
 *
 * Supports MULTIPLE layouts per wedding (v1.18.0) — e.g. Dinner + Reception +
 * any extra spaces — selected via the tab bar above the canvas. Each layout owns
 * its own tables, objects, and venue. Within a layout: templates, decorative
 * objects, smart placement, rotate/resize, copy-to-place, drag-and-drop seating,
 * a to-scale (and drag-resizable) venue boundary, and live cursors.
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id, Doc } from '@/convex/_generated/dataModel';
import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo, useRef } from 'react';
import GuestPanel from '@/app/components/GuestPanel';
import ConfirmModal from '@/app/components/ConfirmModal';
import TableShapeIcon from '@/app/components/TableShapeIcon';
import ObjectIcon from '@/app/components/ObjectIcon';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { TEMPLATES, TemplateKey, suggestTemplateKey } from '@/app/lib/templates';
import { OBJECT_PRESETS, type ObjectPreset } from '@/app/lib/objects';
import ExportCsvButton from '@/app/components/ExportCsvButton';
import { downloadFile, exportFilename, toCsv } from '@/app/lib/exportFile';
import { buildDemoContent } from '@/app/lib/demoContent';
import DemoSeatingPreview from '@/app/components/DemoSeatingPreview';

const FT_PER_M = 3.28084;

const SeatingCanvas = dynamic(() => import('@/app/components/SeatingCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-bg">
      <p className="text-sm text-ink-faint">Loading canvas…</p>
    </div>
  ),
});

/**
 * Find the first grid position on the canvas that doesn't overlap any existing
 * table. Scans left-to-right, top-to-bottom in steps of STEP px.
 */
function findOpenSpot(
  tables: { x: number; y: number }[],
  canvasW: number,
  canvasH: number
): { x: number; y: number } {
  const STEP     = 180;
  const MIN_DIST = 155;
  const MARGIN   = 100;

  for (let row = 0; MARGIN + row * STEP < canvasH - MARGIN; row++) {
    for (let col = 0; MARGIN + col * STEP < canvasW - MARGIN; col++) {
      const x = MARGIN + col * STEP;
      const y = MARGIN + row * STEP;
      const clear = !tables.some(
        t => Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2) < MIN_DIST
      );
      if (clear) return { x, y };
    }
  }
  return { x: Math.round(canvasW / 2), y: Math.round(canvasH / 2) };
}

// Remembers each sidebar width for the session (survives in-app navigation;
// module-level so there's no localStorage read in render → no hydration mismatch
// and no setState-in-effect).
const SIDEBAR_WIDTHS: Record<string, number> = {};

/**
 * Drag-to-resize width for a sidebar. `edge` is which edge carries the handle:
 * 'right' (left sidebar — drag right to widen) or 'left' (right sidebar — drag
 * left to widen).
 */
function useDragWidth(key: string, initial: number, min: number, max: number, edge: 'left' | 'right') {
  const [w, setWState] = useState(() => SIDEBAR_WIDTHS[key] ?? initial);
  const setW = (n: number) => { SIDEBAR_WIDTHS[key] = n; setWState(n); };
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = w;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const nw = edge === 'right' ? startW + dx : startW - dx;
      setW(Math.max(min, Math.min(max, nw)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return { w, onDown };
}

export default function SeatingPage() {
  const { workspaceId, workspaceName, entitlement, isDemo } = useWorkspace();
  const demo = useMemo(() => buildDemoContent(workspaceId), [workspaceId]);
  const leftBar  = useDragWidth('avow:seatingLeftW',  288, 220, 460, 'right');
  const rightBar = useDragWidth('avow:seatingRightW', 288, 220, 460, 'left');

  // ── Data ──────────────────────────────────────────────────────────────────
  const allTables   = useQuery(api.tables.list,          { workspaceId }) ?? [];
  const guests      = useQuery(api.guests.list,          { workspaceId }) ?? [];
  const allAssigns  = useQuery(api.seatAssignments.list, { workspaceId }) ?? [];
  const layouts     = useQuery(api.layouts.list,         { workspaceId }) ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const createTable    = useMutation(api.tables.create);
  const createBatch    = useMutation(api.tables.createBatch);
  const clearAll       = useMutation(api.tables.clearAll);
  const updateTable    = useMutation(api.tables.update);
  const removeTable    = useMutation(api.tables.remove);
  const assign         = useMutation(api.seatAssignments.assign);
  const unassign       = useMutation(api.seatAssignments.unassign);
  const ensureLayouts  = useMutation(api.layouts.ensure);
  const createLayout   = useMutation(api.layouts.create);
  const renameLayout   = useMutation(api.layouts.rename);
  const removeLayout   = useMutation(api.layouts.remove);
  const setLayoutVenue = useMutation(api.layouts.setVenue);

  // Create the default Dinner + Reception layouts on first visit (idempotent).
  // Waits for entitlement to resolve (not 'loading') and skips entirely in
  // demo mode: otherwise the effect fires once while status is still
  // 'loading' — before isDemo has settled to true — and the mutation gets
  // rejected server-side (canEdit is false), just to log a console error.
  // Demo mode also wants this skipped permanently, so the real workspace
  // stays genuinely empty underneath the example content.
  useEffect(() => {
    if (entitlement.status === 'loading' || isDemo) return;
    ensureLayouts({ workspaceId }).catch(() => {});
  }, [workspaceId, ensureLayouts, entitlement.status, isDemo]);

  // ── Active layout ──────────────────────────────────────────────────────────
  const [pickedLayoutId, setPickedLayoutId] = useState<string | null>(null);
  const activeLayoutId =
    pickedLayoutId && layouts.some(l => l._id === pickedLayoutId)
      ? pickedLayoutId
      : layouts[0]?._id ?? null;
  const activeLayout = layouts.find(l => l._id === activeLayoutId) ?? null;

  // Tables / assignments scoped to the active layout.
  const tables = allTables.filter(t => t.layoutId === activeLayoutId);
  const layoutTableIds = new Set(tables.map(t => t._id));
  const assignments = allAssigns.filter(a => layoutTableIds.has(a.tableId));

  // ── UI state ────────────────────────────────────────────────────────────
  const [selectedTableId,  setSelectedTableId]  = useState<string | null>(null);
  const [draggingGuestId,  setDraggingGuestId]  = useState<string | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [canvasSize,       setCanvasSize]       = useState({ width: 1000, height: 650 });

  // Layout rename inline editor
  const [renamingLayoutId, setRenamingLayoutId] = useState<string | null>(null);
  const [layoutNameInput,  setLayoutNameInput]  = useState('');

  // Venue inputs (stored in feet; displayed per-dimension in ft or m).
  const venueW = activeLayout?.venueWidthFt;
  const venueL = activeLayout?.venueLengthFt;
  const [wUnit, setWUnit] = useState<'ft' | 'm'>('ft');
  const [lUnit, setLUnit] = useState<'ft' | 'm'>('ft');
  const [venueWInput, setVenueWInput] = useState<string | null>(null);
  const [venueLInput, setVenueLInput] = useState<string | null>(null);
  const fmt = (ft: number, unit: 'ft' | 'm') =>
    unit === 'm' ? (ft / FT_PER_M).toFixed(1) : String(ft);
  const wVal = venueWInput ?? (venueW != null ? fmt(venueW, wUnit) : '');
  const lVal = venueLInput ?? (venueL != null ? fmt(venueL, lUnit) : '');

  // Template sizing
  const [customSeats,     setCustomSeats]     = useState(false);
  const [customSeatCount, setCustomSeatCount] = useState(0);
  const targetSeats  = customSeats ? customSeatCount : guests.length;
  const canApply     = targetSeats >= 1;
  const suggestedKey = suggestTemplateKey(targetSeats);

  // Template preview/apply: clicking a template opens a Preview / Use panel
  // rather than applying immediately. Preview overlays it without clearing.
  const [tplKey,    setTplKey]    = useState<TemplateKey | null>(null);
  const [previewOn, setPreviewOn] = useState(false);
  const previewTables =
    previewOn && tplKey && canApply
      ? TEMPLATES[tplKey].build(canvasSize.width, canvasSize.height, Math.max(1, targetSeats))
      : null;

  const [modal, setModal] = useState<{
    message: string; confirmLabel: string; destructive: boolean; onConfirm: () => void;
  } | null>(null);
  function showConfirm(message: string, onConfirm: () => void, confirmLabel = 'Confirm', destructive = false) {
    setModal({ message, onConfirm, confirmLabel, destructive });
  }
  function closeModal() { setModal(null); }

  const [editLabel,     setEditLabel]     = useState('');
  const [editSeatCount, setEditSeatCount] = useState(8);

  const selectedTable = tables.find(t => t._id === selectedTableId) ?? null;

  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedTableId === prevSelectedIdRef.current) return;
    prevSelectedIdRef.current = selectedTableId;
    if (selectedTable) {
      setEditLabel(selectedTable.label ?? '');
      setEditSeatCount(selectedTable.seatCount);
    }
  }, [selectedTableId, selectedTable]);

  // Clicking outside the template dropdown closes it — and slides the
  // Preview / Use overlay away with it.
  useEffect(() => {
    if (!templateMenuOpen) return;
    const handler = () => { setTemplateMenuOpen(false); setTplKey(null); setPreviewOn(false); };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [templateMenuOpen]);

  // ── Layout handlers ────────────────────────────────────────────────────────
  function switchLayout(id: string) {
    setPickedLayoutId(id);
    setSelectedTableId(null);
    setVenueWInput(null);
    setVenueLInput(null);
  }
  async function handleAddLayout() {
    const id = await createLayout({ workspaceId, name: `Layout ${layouts.length + 1}` });
    switchLayout(id);
  }
  function startRenameLayout(l: Doc<'seatingLayouts'>) {
    setRenamingLayoutId(l._id);
    setLayoutNameInput(l.name);
  }
  async function commitRenameLayout() {
    const id = renamingLayoutId;
    const name = layoutNameInput.trim();
    setRenamingLayoutId(null);
    if (id && name) await renameLayout({ layoutId: id as Id<'seatingLayouts'>, name }).catch(() => {});
  }
  function handleRemoveLayout(l: Doc<'seatingLayouts'>) {
    showConfirm(
      `Delete the "${l.name}" layout and all of its tables? This can't be undone.`,
      async () => {
        closeModal();
        setSelectedTableId(null);
        setPickedLayoutId(null);
        await removeLayout({ layoutId: l._id }).catch(() => {});
      },
      'Delete layout',
      true
    );
  }

  // ── Table / object / template handlers ─────────────────────────────────────
  async function handleAddTable(shape: 'round' | 'rectangular') {
    if (!activeLayoutId) return;
    const { x, y } = findOpenSpot(tables, canvasSize.width, canvasSize.height);
    await createTable({
      workspaceId, layoutId: activeLayoutId as Id<'seatingLayouts'>,
      shape, seatCount: shape === 'round' ? 8 : 6, x, y, rotation: 0,
      label: `Table ${tables.length + 1}`,
    });
  }

  async function handleAddObject(preset: ObjectPreset) {
    if (!activeLayoutId) return;
    const { x, y } = findOpenSpot(tables, canvasSize.width, canvasSize.height);
    await createTable({
      workspaceId, layoutId: activeLayoutId as Id<'seatingLayouts'>,
      kind: 'object', objectKind: preset.key, shape: preset.shape, seatCount: 0, x, y, rotation: 0, label: preset.label,
      ...(preset.radius != null ? { radius: preset.radius } : {}),
      ...(preset.width  != null ? { width:  preset.width }  : {}),
      ...(preset.height != null ? { height: preset.height } : {}),
    });
  }

  function handleResetAll() {
    if (tables.length === 0 || !activeLayoutId) return;
    showConfirm(
      `Reset the "${activeLayout?.name ?? ''}" layout? This removes every table in it.`,
      async () => {
        closeModal();
        setSelectedTableId(null);
        await clearAll({ workspaceId, layoutId: activeLayoutId as Id<'seatingLayouts'> });
      },
      'Reset layout',
      true
    );
  }

  // Clicking a template reveals the Preview / Use overlay over its row; the
  // dropdown stays open so the choice sits in context.
  function selectTemplate(key: TemplateKey) {
    if (!canApply) return;
    setTplKey(key);
    setPreviewOn(false);
  }

  function useSelectedTemplate() {
    const key = tplKey;
    if (!key || !canApply || !activeLayoutId) return;
    const seats = Math.max(1, targetSeats);
    const apply = async () => {
      closeModal();
      setSelectedTableId(null);
      setPreviewOn(false);
      setTplKey(null);
      setTemplateMenuOpen(false);
      await clearAll({ workspaceId, layoutId: activeLayoutId as Id<'seatingLayouts'> });
      await createBatch({
        workspaceId,
        layoutId: activeLayoutId as Id<'seatingLayouts'>,
        tables: TEMPLATES[key].build(canvasSize.width, canvasSize.height, seats),
      });
    };
    if (tables.length > 0) showConfirm('This will clear this layout and apply the template. Continue?', apply);
    else apply();
  }

  async function handleCommitLabel() {
    if (!selectedTableId) return;
    await updateTable({ tableId: selectedTableId as Id<'tables'>, label: editLabel || undefined });
  }
  async function handleCommitSeatCount(n: number) {
    if (!selectedTableId) return;
    setEditSeatCount(n);
    await updateTable({ tableId: selectedTableId as Id<'tables'>, seatCount: n });
  }
  function handleDeleteSelected() {
    if (!selectedTableId) return;
    const id = selectedTableId;
    showConfirm('Delete this table and all its seat assignments?', async () => {
      closeModal();
      setSelectedTableId(null);
      await removeTable({ tableId: id as Id<'tables'> });
    }, 'Delete', true);
  }
  function handleRequestUnassign(guestId: Id<'guests'>, guestName: string) {
    showConfirm(`Unassign ${guestName} from their seat?`, async () => {
      closeModal();
      await unassign({ guestId, ...(activeLayoutId ? { layoutId: activeLayoutId as Id<'seatingLayouts'> } : {}) });
    }, 'Unassign');
  }

  // ── Venue handlers ─────────────────────────────────────────────────────────
  async function applyVenue() {
    if (!activeLayoutId) return;
    const w = wUnit === 'm' ? parseFloat(wVal) * FT_PER_M : parseFloat(wVal);
    const l = lUnit === 'm' ? parseFloat(lVal) * FT_PER_M : parseFloat(lVal);
    if (!w || !l) return;
    await setLayoutVenue({ layoutId: activeLayoutId as Id<'seatingLayouts'>, widthFt: w, lengthFt: l });
    setVenueWInput(null); setVenueLInput(null);
  }
  async function clearVenue() {
    if (!activeLayoutId) return;
    await setLayoutVenue({ layoutId: activeLayoutId as Id<'seatingLayouts'>, widthFt: null, lengthFt: null });
    setVenueWInput(null); setVenueLInput(null);
  }
  // Drag-resizing the venue edge in the canvas commits the new size (in feet).
  async function handleVenueResize(widthFt: number, lengthFt: number) {
    if (!activeLayoutId) return;
    await setLayoutVenue({ layoutId: activeLayoutId as Id<'seatingLayouts'>, widthFt, lengthFt });
  }
  function toggleUnit(which: 'w' | 'l') {
    const unit = which === 'w' ? wUnit : lUnit;
    const cur  = which === 'w' ? wVal : lVal;
    const next: 'ft' | 'm' = unit === 'ft' ? 'm' : 'ft';
    const ft = cur === '' ? null : (unit === 'm' ? parseFloat(cur) * FT_PER_M : parseFloat(cur));
    const shown = ft == null ? '' : (next === 'm' ? (ft / FT_PER_M).toFixed(1) : String(Math.round(ft)));
    if (which === 'w') { setWUnit(next); setVenueWInput(shown); }
    else               { setLUnit(next); setVenueLInput(shown); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Demo mode renders a static preview instead — see DemoSeatingPreview for
  // why this isn't just SeatingCanvas with a readOnly prop. All the hooks
  // above still run (real, mostly-empty queries) so this stays a plain
  // conditional render, not a conditional hook.
  if (isDemo) {
    return <DemoSeatingPreview tables={demo.tables} guests={demo.guests} seatAssignments={demo.seatAssignments} />;
  }

  return (
    <>
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left sidebar — table tools (drag the inner edge to resize) */}
        <div className="relative border-r border-rule bg-bg/60 flex flex-col shrink-0" style={{ width: leftBar.w }}>
          <div className="flex-1 overflow-y-auto p-3">
            {/* Use Template — moved to the top of the sidebar */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setTemplateMenuOpen(o => !o)} className="btn btn-secondary w-full text-sm px-3 py-2">Use Template ▾</button>
              {templateMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-full bg-white border border-rule rounded-lg shadow-lg z-50 overflow-hidden max-h-[24rem] overflow-y-auto">
                  <div className="px-4 py-3 border-b border-rule bg-bg-tint/40 sticky top-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-ink">Seats to plan for</span>
                      <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer select-none">
                        <input type="checkbox" checked={customSeats} onChange={(e) => { const on = e.target.checked; setCustomSeats(on); if (on) setCustomSeatCount(guests.length); }} />
                        Custom
                      </label>
                    </div>
                    <input type="number" min={1} value={customSeats ? (customSeatCount || '') : guests.length} disabled={!customSeats}
                      onChange={(e) => setCustomSeatCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="app-input w-full text-sm px-2 py-1.5 disabled:opacity-60" />
                    <p className="text-[0.65rem] text-ink-faint mt-1">
                      {customSeats ? 'Using a custom guest count.' : `Auto-filled from your ${guests.length} guest${guests.length === 1 ? '' : 's'}.`}
                    </p>
                  </div>
                  {!canApply && (
                    <p className="px-4 py-3 text-xs text-ink-faint">
                      {customSeats
                        ? <>Enter how many seats to plan for — the templates below unlock once there&apos;s a number.</>
                        : <>Add guests, or turn on <strong>Custom</strong> and enter a number, to generate a layout.</>}
                    </p>
                  )}
                  {(Object.entries(TEMPLATES) as [TemplateKey, (typeof TEMPLATES)[TemplateKey]][]).map(([key, tmpl]) => {
                    const { tableCount, totalSeats } = tmpl.plan(Math.max(1, targetSeats));
                    const selected = tplKey === key;
                    return (
                      <div key={key} className="relative border-b last:border-0 border-rule">
                        <button onClick={() => selectTemplate(key)} disabled={!canApply}
                          className="block w-full text-left px-4 py-3 hover:bg-bg-tint transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-ink">{tmpl.label}</span>
                            {canApply && key === suggestedKey && (
                              <span className="text-[0.55rem] uppercase tracking-wide font-medium bg-accent/15 text-accent px-1.5 py-0.5 rounded">Suggested</span>
                            )}
                          </div>
                          <div className="text-xs text-ink-faint mt-0.5">{tmpl.description}</div>
                          {canApply && <div className="text-[0.7rem] text-accent mt-1">{tableCount} table{tableCount === 1 ? '' : 's'} · {totalSeats} seats</div>}
                        </button>

                        {/* Preview / Use overlay — sits over the chosen row */}
                        {selected && (
                          <div className="absolute inset-0 flex items-center gap-1.5 px-3 bg-white/95 backdrop-blur-sm animate-fade-in">
                            <button onClick={() => setPreviewOn(o => !o)} className={`btn text-xs px-2 py-1.5 flex-1 ${previewOn ? 'btn-primary' : 'btn-secondary'}`}>
                              {previewOn ? 'Exit preview' : 'Preview'}
                            </button>
                            <button onClick={useSelectedTemplate} className="btn btn-primary text-xs px-2 py-1.5 flex-1">Use this</button>
                            <button onClick={() => { setTplKey(null); setPreviewOn(false); }} title="Close" className="text-ink-faint hover:text-ink text-sm px-1 shrink-0">✕</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tables — guest tables + table-style objects (compact 2-col grid) */}
            <div className="mt-3 pt-3 border-t border-rule">
              <p className="text-[0.65rem] font-semibold text-ink-faint mb-1.5 px-0.5 uppercase tracking-wide">Tables</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => handleAddTable('round')} className="btn btn-secondary text-xs px-2 py-1.5 flex items-center justify-center gap-1.5">
                  Round <TableShapeIcon shape="round" />
                </button>
                <button onClick={() => handleAddTable('rectangular')} className="btn btn-secondary text-xs px-2 py-1.5 flex items-center justify-center gap-1.5">
                  Rectangular <TableShapeIcon shape="rectangular" />
                </button>
                {OBJECT_PRESETS.filter(p => p.group === 'table').map((p) => (
                  <button key={p.key} onClick={() => handleAddObject(p)} className="btn btn-secondary text-xs px-2 py-1.5 flex items-center justify-center gap-1.5">
                    {p.label} <ObjectIcon name={p.key} size={16} />
                  </button>
                ))}
              </div>
            </div>

            {/* Features — non-seating areas (bar, stage, dance floor, DJ/band) */}
            <div className="mt-3">
              <p className="text-[0.65rem] font-semibold text-ink-faint mb-1.5 px-0.5 uppercase tracking-wide">Features</p>
              <div className="grid grid-cols-2 gap-1.5">
                {OBJECT_PRESETS.filter(p => p.group === 'feature').map((p) => (
                  <button key={p.key} onClick={() => handleAddObject(p)} className="btn btn-secondary text-xs px-2 py-1.5 flex items-center justify-center gap-1.5">
                    {p.label} <ObjectIcon name={p.key} size={16} />
                  </button>
                ))}
              </div>
            </div>

            {/* Generic object */}
            {OBJECT_PRESETS.filter(p => p.group === 'other').map((p) => (
              <button key={p.key} onClick={() => handleAddObject(p)} className="btn btn-secondary w-full text-xs px-3 py-1.5 mt-2 flex items-center justify-center gap-1.5">
                + New object <ObjectIcon name={p.key} size={16} />
              </button>
            ))}

            {/* Venue size — to-scale boundary you can drag-resize on the canvas */}
            <div className="mt-3 pt-3 border-t border-rule" onClick={e => e.stopPropagation()}>
              <p className="text-xs font-medium text-ink-faint mb-2 px-1">Venue size</p>
              <div className="flex items-start gap-2 mb-2">
                <VenueField label="Width" value={wVal} unit={wUnit} onChange={setVenueWInput} onToggleUnit={() => toggleUnit('w')} />
                <span className="text-ink-faint text-xs mt-6">×</span>
                <VenueField label="Length" value={lVal} unit={lUnit} onChange={setVenueLInput} onToggleUnit={() => toggleUnit('l')} />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={applyVenue} className="btn btn-secondary text-xs px-2 py-1.5 flex-1">Set size</button>
                {venueW != null && <button onClick={clearVenue} className="text-xs text-ink-faint hover:text-red-600 transition-colors">Clear</button>}
              </div>
            </div>
          </div>

          {/* Resize handle on the inner (right) edge */}
          <div
            onMouseDown={leftBar.onDown}
            title="Drag to resize"
            className="absolute right-0 top-0 bottom-0 w-1.5 -mr-0.5 cursor-col-resize hover:bg-accent/30 transition-colors z-20"
          />
        </div>

        {/* Canvas column — layout tabs above the canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-1 px-3 h-10 border-b border-rule bg-bg/40 shrink-0 overflow-x-auto">
            {layouts.map((l) => (
              renamingLayoutId === l._id ? (
                <input key={l._id} autoFocus value={layoutNameInput}
                  onChange={(e) => setLayoutNameInput(e.target.value)}
                  onBlur={commitRenameLayout}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRenameLayout(); if (e.key === 'Escape') setRenamingLayoutId(null); }}
                  className="app-input text-sm px-2 py-0.5 w-32" />
              ) : (
                <button key={l._id} onClick={() => switchLayout(l._id)} onDoubleClick={() => startRenameLayout(l)}
                  title="Double-click to rename"
                  className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${l._id === activeLayoutId ? 'bg-white border border-rule text-ink font-medium shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
                  {l.name}
                </button>
              )
            ))}
            <button onClick={handleAddLayout} className="px-2 py-1 text-sm text-accent hover:bg-bg-tint rounded-md whitespace-nowrap" title="Add a seating layout">+ Layout</button>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <ExportCsvButton
                label="Export CSV"
                title="Download the seating chart for every layout as a spreadsheet (CSV)"
                disabled={allTables.length === 0}
                onExport={() => {
                  const layoutName = new Map(layouts.map((l) => [l._id as string, l.name]));
                  const guestName = new Map(guests.map((g) => [g._id as string, g.name]));
                  // One row per seat: every layout, every table, every assigned guest.
                  const rows = allTables.flatMap((t) => {
                    const seats = allAssigns.filter((a) => a.tableId === t._id);
                    const label = t.label ?? '';
                    const layout = t.layoutId ? layoutName.get(t.layoutId as string) ?? '' : '';
                    if (seats.length === 0) {
                      return [{ layout, table: label, kind: t.kind ?? 'seating', seat: '', guest: '' }];
                    }
                    return seats
                      .slice()
                      .sort((a, b) => a.seatIndex - b.seatIndex)
                      .map((a) => ({
                        layout,
                        table: label,
                        kind: t.kind ?? 'seating',
                        seat: String(a.seatIndex + 1),
                        guest: guestName.get(a.guestId as string) ?? '',
                      }));
                  });
                  downloadFile(
                    exportFilename(workspaceName, 'seating', 'csv'),
                    toCsv(rows, [
                      { header: 'Layout', value: (r) => r.layout },
                      { header: 'Table', value: (r) => r.table },
                      { header: 'Type', value: (r) => (r.kind === 'object' ? 'Feature' : 'Table') },
                      { header: 'Seat', value: (r) => r.seat },
                      { header: 'Guest', value: (r) => r.guest },
                    ]),
                    'text/csv'
                  );
                }}
              />
              {tables.length > 0 && (
                <button onClick={handleResetAll} className="text-xs text-ink-faint hover:text-red-600 px-2 whitespace-nowrap" title="Remove every table in this layout">Reset layout</button>
              )}
              {layouts.length > 1 && activeLayout && (
                <button onClick={() => handleRemoveLayout(activeLayout)} className="text-xs text-ink-faint hover:text-red-600 px-2 whitespace-nowrap" title="Delete this layout">Delete layout</button>
              )}
            </div>
          </div>

          <SeatingCanvas
            workspaceId={workspaceId}
            activeLayoutId={(activeLayoutId ?? undefined) as Id<'seatingLayouts'> | undefined}
            tables={tables}
            guests={guests}
            assignments={assignments}
            draggingGuestId={draggingGuestId}
            onAssignGuest={(tableId, seatIndex, guestId) => assign({ tableId, seatIndex, guestId })}
            onRequestUnassign={handleRequestUnassign}
            selectedTableId={selectedTableId}
            onSelectTable={setSelectedTableId}
            onSizeChange={(w, h) => setCanvasSize({ width: w, height: h })}
            venueWidthFt={venueW}
            venueHeightFt={venueL}
            onVenueResize={handleVenueResize}
            previewTables={previewTables}
            editLabel={editLabel}
            editSeatCount={editSeatCount}
            onEditLabel={setEditLabel}
            onEditSeatCount={setEditSeatCount}
            onCommitLabel={handleCommitLabel}
            onCommitSeatCount={handleCommitSeatCount}
            onDeleteSelected={handleDeleteSelected}
          />
        </div>

        <GuestPanel
          guests={guests}
          assignments={assignments}
          draggingGuestId={draggingGuestId}
          onDragStart={setDraggingGuestId}
          onDragEnd={() => setDraggingGuestId(null)}
          width={rightBar.w}
          onResizeStart={rightBar.onDown}
        />
      </div>

      {modal && (
        <ConfirmModal message={modal.message} confirmLabel={modal.confirmLabel} destructive={modal.destructive} onConfirm={modal.onConfirm} onCancel={closeModal} />
      )}
    </>
  );
}

// ── Venue dimension field — number + ft/m toggle ─────────────────────────────
function VenueField({
  label, value, unit, onChange, onToggleUnit,
}: {
  label: string;
  value: string;
  unit: 'ft' | 'm';
  onChange: (v: string) => void;
  onToggleUnit: () => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[0.6rem] text-ink-faint mb-0.5 px-0.5">{label}</label>
      <input
        type="number" min={1} step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="app-input w-full text-xs px-2 py-1.5 tabular-nums text-center"
      />
      {/* ft / m — sliding pill switch */}
      <button
        type="button"
        onClick={onToggleUnit}
        aria-label={`Unit: ${unit === 'ft' ? 'feet' : 'metres'} — tap to switch`}
        className="relative mt-1 flex w-full rounded-full bg-bg-tint p-0.5 text-[0.6rem] select-none"
      >
        <span
          className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-sm transition-transform duration-150 ${unit === 'm' ? 'translate-x-full' : ''}`}
        />
        <span className={`relative z-10 flex-1 text-center py-0.5 transition-colors ${unit === 'ft' ? 'text-ink font-medium' : 'text-ink-faint'}`}>ft</span>
        <span className={`relative z-10 flex-1 text-center py-0.5 transition-colors ${unit === 'm' ? 'text-ink font-medium' : 'text-ink-faint'}`}>m</span>
      </button>
    </div>
  );
}
