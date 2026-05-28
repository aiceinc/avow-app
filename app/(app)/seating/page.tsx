'use client';

/**
 * /seating — the seating planner module.
 *
 * Moved from the former single-page app into its own route. The toolbar,
 * module tabs, and footer now live in the (app) shell layout; this page renders
 * the planner work area only (table tools sidebar + Konva canvas + guest panel)
 * and reads the active workspace from WorkspaceContext.
 *
 * Functionally unchanged from before: templates, smart placement, rotate,
 * resize, copy-to-place, drag-and-drop seating, live cursors.
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import GuestPanel from '@/app/components/GuestPanel';
import ConfirmModal from '@/app/components/ConfirmModal';
import TableShapeIcon from '@/app/components/TableShapeIcon';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { TEMPLATES, TemplateKey } from '@/app/lib/templates';

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
 * Falls back to canvas centre if every slot is occupied.
 */
function findOpenSpot(
  tables: { x: number; y: number }[],
  canvasW: number,
  canvasH: number
): { x: number; y: number } {
  const STEP     = 180; // grid spacing (px)
  const MIN_DIST = 155; // minimum allowed centre-to-centre distance
  const MARGIN   = 100; // inset from canvas edges

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

  // Fallback: canvas centre (acceptable if the canvas is extremely crowded)
  return { x: Math.round(canvasW / 2), y: Math.round(canvasH / 2) };
}

export default function SeatingPage() {
  const { workspaceId } = useWorkspace();

  // ── Data ──────────────────────────────────────────────────────────────────
  const tables      = useQuery(api.tables.list,          { workspaceId }) ?? [];
  const guests      = useQuery(api.guests.list,          { workspaceId }) ?? [];
  const assignments = useQuery(api.seatAssignments.list, { workspaceId }) ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const createTable = useMutation(api.tables.create);
  const createBatch = useMutation(api.tables.createBatch);
  const clearAll    = useMutation(api.tables.clearAll);
  const updateTable = useMutation(api.tables.update);
  const removeTable = useMutation(api.tables.remove);
  const assign      = useMutation(api.seatAssignments.assign);
  const unassign    = useMutation(api.seatAssignments.unassign);

  // ── UI state ────────────────────────────────────────────────────────────
  const [selectedTableId,  setSelectedTableId]  = useState<string | null>(null);
  const [draggingGuestId,  setDraggingGuestId]  = useState<string | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [canvasSize,       setCanvasSize]       = useState({ width: 1000, height: 650 });

  const [modal, setModal] = useState<{
    message:      string;
    confirmLabel: string;
    destructive:  boolean;
    onConfirm:    () => void;
  } | null>(null);

  function showConfirm(
    message:      string,
    onConfirm:    () => void,
    confirmLabel  = 'Confirm',
    destructive   = false
  ) {
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

  useEffect(() => {
    if (!templateMenuOpen) return;
    const handler = () => setTemplateMenuOpen(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [templateMenuOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleAddTable(shape: 'round' | 'rectangular') {
    const { x, y } = findOpenSpot(tables, canvasSize.width, canvasSize.height);
    await createTable({
      workspaceId,
      shape,
      seatCount: shape === 'round' ? 8 : 6,
      x,
      y,
      rotation: 0,
      label: `Table ${tables.length + 1}`,
    });
  }

  function handleResetAll() {
    if (tables.length === 0) return;
    showConfirm(
      'Start over? This removes all tables and their seat assignments.',
      async () => {
        closeModal();
        setSelectedTableId(null);
        await clearAll({ workspaceId });
      },
      'Start over',
      true
    );
  }

  function handleApplyTemplate(key: TemplateKey) {
    setTemplateMenuOpen(false);
    const apply = async () => {
      closeModal();
      setSelectedTableId(null);
      await clearAll({ workspaceId });
      await createBatch({
        workspaceId,
        tables: TEMPLATES[key].build(canvasSize.width, canvasSize.height),
      });
    };
    if (tables.length > 0) {
      showConfirm('This will clear your current layout. Continue?', apply);
    } else {
      apply();
    }
  }

  // Commit the label on blur / Enter (rotation is handled in SeatingCanvas)
  async function handleCommitLabel() {
    if (!selectedTableId) return;
    await updateTable({
      tableId: selectedTableId as Id<'tables'>,
      label:   editLabel || undefined,
    });
  }

  // Commit seat count instantly on each stepper click
  async function handleCommitSeatCount(n: number) {
    if (!selectedTableId) return;
    setEditSeatCount(n);
    await updateTable({
      tableId:   selectedTableId as Id<'tables'>,
      seatCount: n,
    });
  }

  function handleDeleteSelected() {
    if (!selectedTableId) return;
    const id = selectedTableId;
    showConfirm(
      'Delete this table and all its seat assignments?',
      async () => {
        closeModal();
        setSelectedTableId(null);
        await removeTable({ tableId: id as Id<'tables'> });
      },
      'Delete',
      true
    );
  }

  function handleRequestUnassign(guestId: Id<'guests'>, guestName: string) {
    showConfirm(
      `Unassign ${guestName} from their seat?`,
      async () => {
        closeModal();
        await unassign({ guestId });
      },
      'Unassign'
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left sidebar — table tools */}
        <div className="w-44 border-r border-rule bg-bg/60 flex flex-col shrink-0 p-3">
          <p className="text-xs font-medium text-ink-faint mb-2 px-1">Add tables</p>

          <button
            onClick={() => handleAddTable('round')}
            className="btn btn-secondary w-full text-sm px-3 py-2 mb-2 flex items-center justify-center gap-2"
          >
            Add
            <TableShapeIcon shape="round" />
          </button>

          <button
            onClick={() => handleAddTable('rectangular')}
            className="btn btn-secondary w-full text-sm px-3 py-2 mb-3 flex items-center justify-center gap-2"
          >
            Add
            <TableShapeIcon shape="rectangular" />
          </button>

          {/* Template picker */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setTemplateMenuOpen(o => !o)}
              className="btn btn-secondary w-full text-sm px-3 py-2"
            >
              Use Template ▾
            </button>
            {templateMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-rule rounded-lg shadow-lg z-50 overflow-hidden">
                {(Object.entries(TEMPLATES) as [TemplateKey, (typeof TEMPLATES)[TemplateKey]][]).map(
                  ([key, tmpl]) => (
                    <button
                      key={key}
                      onClick={() => handleApplyTemplate(key)}
                      className="block w-full text-left px-4 py-3 hover:bg-bg-tint border-b last:border-0 border-rule transition-colors"
                    >
                      <div className="text-sm text-ink">{tmpl.label}</div>
                      <div className="text-xs text-ink-faint mt-0.5">{tmpl.description}</div>
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Start over — pinned to the bottom */}
          <button
            onClick={handleResetAll}
            className="btn btn-danger w-full text-sm px-3 py-2 mt-auto"
          >
            Start over
          </button>
        </div>

        <SeatingCanvas
          workspaceId={workspaceId}
          tables={tables}
          guests={guests}
          assignments={assignments}
          draggingGuestId={draggingGuestId}
          onAssignGuest={(tableId, seatIndex, guestId) =>
            assign({ tableId, seatIndex, guestId })
          }
          onRequestUnassign={handleRequestUnassign}
          selectedTableId={selectedTableId}
          onSelectTable={setSelectedTableId}
          onSizeChange={(w, h) => setCanvasSize({ width: w, height: h })}
          editLabel={editLabel}
          editSeatCount={editSeatCount}
          onEditLabel={setEditLabel}
          onEditSeatCount={setEditSeatCount}
          onCommitLabel={handleCommitLabel}
          onCommitSeatCount={handleCommitSeatCount}
          onDeleteSelected={handleDeleteSelected}
        />

        <GuestPanel
          guests={guests}
          assignments={assignments}
          draggingGuestId={draggingGuestId}
          onDragStart={setDraggingGuestId}
          onDragEnd={() => setDraggingGuestId(null)}
        />
      </div>

      {modal && (
        <ConfirmModal
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          destructive={modal.destructive}
          onConfirm={modal.onConfirm}
          onCancel={closeModal}
        />
      )}
    </>
  );
}
