'use client';

/**
 * page.tsx — main seating planner page
 *
 * This is the root of the UI. It:
 *  - Loads all data from Convex (tables, guests, seat assignments)
 *  - Renders the toolbar (add table, templates)
 *  - Renders the table edit bar when a table is selected
 *  - Renders the canvas (lazy-loaded, no SSR) and the guest panel side by side
 *
 * All Convex mutations are called from here or from SeatingCanvas directly
 * (for drag position updates, which only the canvas knows about).
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import GuestPanel from './components/GuestPanel';
import ConfirmModal from './components/ConfirmModal';
import { TEMPLATES, TemplateKey } from './lib/templates';

// SeatingCanvas uses Konva which requires `window` — disable SSR
const SeatingCanvas = dynamic(() => import('./components/SeatingCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-stone-50">
      <p className="text-sm text-gray-400">Loading canvas…</p>
    </div>
  ),
});

export default function Home() {
  // ── Data ────────────────────────────────────────────────────────────────────
  const tables      = useQuery(api.tables.list)           ?? [];
  const guests      = useQuery(api.guests.list)           ?? [];
  const assignments = useQuery(api.seatAssignments.list)  ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createTable = useMutation(api.tables.create);
  const createBatch = useMutation(api.tables.createBatch);
  const clearAll    = useMutation(api.tables.clearAll);
  const updateTable = useMutation(api.tables.update);
  const removeTable = useMutation(api.tables.remove);
  const assign      = useMutation(api.seatAssignments.assign);
  const unassign    = useMutation(api.seatAssignments.unassign);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [draggingGuestId, setDraggingGuestId] = useState<string | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 650 });

  // Modal state — replaces native browser confirm() throughout
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

  // Edit bar fields — synced from the selected table when selection changes
  const [editLabel,     setEditLabel]     = useState('');
  const [editSeatCount, setEditSeatCount] = useState(8);
  const [editRotation,  setEditRotation]  = useState(0);

  const selectedTable = tables.find(t => t._id === selectedTableId) ?? null;

  // Sync edit bar when the selection ID changes
  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedTableId === prevSelectedIdRef.current) return;
    prevSelectedIdRef.current = selectedTableId;
    if (selectedTable) {
      setEditLabel(selectedTable.label ?? '');
      setEditSeatCount(selectedTable.seatCount);
      setEditRotation(selectedTable.rotation);
    }
  }, [selectedTableId, selectedTable]);

  // Close template menu on outside click
  useEffect(() => {
    if (!templateMenuOpen) return;
    const handler = () => setTemplateMenuOpen(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [templateMenuOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleAddTable(shape: 'round' | 'rectangular') {
    const jitter = () => Math.random() * 40 - 20;
    await createTable({
      shape,
      seatCount: shape === 'round' ? 8 : 6,
      x: 320 + jitter(),
      y: 320 + jitter(),
      rotation: 0,
      label: `Table ${tables.length + 1}`,
    });
  }

  function handleApplyTemplate(key: TemplateKey) {
    setTemplateMenuOpen(false);
    const apply = async () => {
      closeModal();
      setSelectedTableId(null);
      await clearAll();
      await createBatch({ tables: TEMPLATES[key].build(canvasSize.width, canvasSize.height) });
    };
    if (tables.length > 0) {
      showConfirm('This will clear your current layout. Continue?', apply);
    } else {
      apply();
    }
  }

  async function handleCommitEdit() {
    if (!selectedTableId) return;
    await updateTable({
      tableId:   selectedTableId as Id<'tables'>,
      label:     editLabel || undefined,
      seatCount: editSeatCount,
      rotation:  editRotation,
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">

      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0 z-10">
        <span className="font-semibold text-gray-800 text-sm mr-1">Avow</span>
        <span className="text-gray-300 text-sm">·</span>
        <span className="text-gray-500 text-sm mr-3">Seating Planner</span>

        <button
          onClick={() => handleAddTable('round')}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors"
        >
          + Round Table
        </button>

        <button
          onClick={() => handleAddTable('rectangular')}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors"
        >
          + Rect Table
        </button>

        {/* Template picker */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setTemplateMenuOpen(o => !o)}
            className="text-sm px-3 py-1.5 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Use Template ▾
          </button>

          {templateMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              {(Object.entries(TEMPLATES) as [TemplateKey, (typeof TEMPLATES)[TemplateKey]][]).map(
                ([key, tmpl]) => (
                  <button
                    key={key}
                    onClick={() => handleApplyTemplate(key)}
                    className="block w-full text-left px-4 py-3 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg border-b last:border-0 border-gray-100"
                  >
                    <div className="text-sm text-gray-800">{tmpl.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{tmpl.description}</div>
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <div className="ml-auto text-xs text-gray-400">
          {tables.length} table{tables.length !== 1 ? 's' : ''} ·{' '}
          {guests.length} guests ·{' '}
          {assignments.length} seated
        </div>
      </div>

      {/* ── Table edit bar (visible when a table is selected) ─────────────────── */}
      {selectedTable && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-amber-200 bg-amber-50 shrink-0">
          <span className="text-xs font-medium text-amber-800 shrink-0">Editing:</span>

          <input
            type="text"
            value={editLabel}
            onChange={e => setEditLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCommitEdit(); }}
            placeholder="Table label"
            className="text-sm border border-gray-300 rounded px-2 py-1 w-36 bg-white"
          />

          <label className="text-xs text-gray-600 flex items-center gap-1.5 shrink-0">
            Seats
            <input
              type="number"
              min={1}
              max={20}
              value={editSeatCount}
              onChange={e => setEditSeatCount(Math.max(1, Number(e.target.value)))}
              className="text-sm border border-gray-300 rounded px-2 py-1 w-16 bg-white"
            />
          </label>

          <label className="text-xs text-gray-600 flex items-center gap-1.5 shrink-0">
            Rotation°
            <input
              type="number"
              min={0}
              max={359}
              value={editRotation}
              onChange={e => setEditRotation(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 w-20 bg-white"
            />
          </label>

          <button
            onClick={handleCommitEdit}
            className="text-sm px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors shrink-0"
          >
            Apply
          </button>

          <button
            onClick={handleDeleteSelected}
            className="text-sm px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors shrink-0"
          >
            Delete Table
          </button>

          <button
            onClick={() => setSelectedTableId(null)}
            className="text-xs text-gray-400 hover:text-gray-600 ml-1 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main area: canvas + guest panel ───────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        <SeatingCanvas
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
        />

        <GuestPanel
          guests={guests}
          assignments={assignments}
          draggingGuestId={draggingGuestId}
          onDragStart={setDraggingGuestId}
          onDragEnd={() => setDraggingGuestId(null)}
        />
      </div>

      {/* Modal renders fixed/full-screen so DOM position doesn't matter */}
      {modal && (
        <ConfirmModal
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          destructive={modal.destructive}
          onConfirm={modal.onConfirm}
          onCancel={closeModal}
        />
      )}

    </div>
  );
}
