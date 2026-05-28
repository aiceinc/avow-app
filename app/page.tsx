'use client';

/**
 * page.tsx — main seating planner page (Phase 2)
 *
 * Auth guard:
 *  - Not authenticated → redirect to /auth
 *  - Authenticated, no workspace → show "Create workspace" form
 *  - Authenticated, one or more workspaces → show the seating planner
 *
 * All Convex queries/mutations now take workspaceId.
 */

import { useQuery, useMutation } from 'convex/react';
import { useConvexAuth, useAuthActions } from '@convex-dev/auth/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import GuestPanel from './components/GuestPanel';
import ConfirmModal from './components/ConfirmModal';
import { TEMPLATES, TemplateKey } from './lib/templates';

const SeatingCanvas = dynamic(() => import('./components/SeatingCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-stone-50">
      <p className="text-sm text-gray-400">Loading canvas…</p>
    </div>
  ),
});

// ── Workspace selection screen ────────────────────────────────────────────────

function WorkspaceScreen({
  onSelect,
}: {
  onSelect: (id: Id<'workspaces'>) => void;
}) {
  const workspaces = useQuery(api.workspaces.listMine) ?? [];
  const createWorkspace = useMutation(api.workspaces.create);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signOut } = useAuthActions();
  const router = useRouter();

  // Auto-select if there's exactly one workspace
  useEffect(() => {
    if (workspaces.length === 1) {
      onSelect(workspaces[0]._id);
    }
  }, [workspaces, onSelect]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const id = await createWorkspace({ name: name.trim() });
      onSelect(id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  }

  // Still loading
  if (workspaces === undefined) {
    return <Centered><p className="text-sm text-gray-400">Loading…</p></Centered>;
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <span className="text-2xl font-semibold text-gray-900">Avow</span>
          <p className="text-sm text-gray-500 mt-1">Seating Planner</p>
        </div>

        {/* Existing workspaces */}
        {workspaces.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-500 mb-3">Your workspaces</p>
            <div className="space-y-2">
              {workspaces.map(ws => (
                <button
                  key={ws._id}
                  onClick={() => onSelect(ws._id)}
                  className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition-colors"
                >
                  <div className="text-sm font-medium text-gray-800">{ws.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {ws.members.length === 1 ? '1 member' : `${ws.members.length} members`}
                  </div>
                </button>
              ))}
            </div>
            <div className="my-6 border-t border-gray-100" />
          </div>
        )}

        {/* Create workspace form */}
        <p className="text-xs font-medium text-gray-500 mb-3">
          {workspaces.length === 0 ? 'Create your first workspace' : 'Create another workspace'}
        </p>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Alex & Jordan's Wedding"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          />
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="w-full text-sm py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create workspace'}
          </button>
        </form>

        <button
          onClick={async () => { await signOut(); router.push('/auth'); }}
          className="mt-6 w-full text-xs text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Main planner ──────────────────────────────────────────────────────────────

function Planner({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  // ── Data ──────────────────────────────────────────────────────────────────
  const tables      = useQuery(api.tables.list,          { workspaceId }) ?? [];
  const guests      = useQuery(api.guests.list,          { workspaceId }) ?? [];
  const assignments = useQuery(api.seatAssignments.list, { workspaceId }) ?? [];
  const workspace   = useQuery(api.workspaces.get,       { workspaceId });

  // ── Mutations ────────────────────────────────────────────────────────────
  const createTable     = useMutation(api.tables.create);
  const createBatch     = useMutation(api.tables.createBatch);
  const clearAll        = useMutation(api.tables.clearAll);
  const updateTable     = useMutation(api.tables.update);
  const removeTable     = useMutation(api.tables.remove);
  const assign          = useMutation(api.seatAssignments.assign);
  const unassign        = useMutation(api.seatAssignments.unassign);
  const generateInvite  = useMutation(api.workspaces.generateInvite);

  const { signOut } = useAuthActions();
  const router = useRouter();

  // ── UI state ────────────────────────────────────────────────────────────
  const [selectedTableId,  setSelectedTableId]  = useState<string | null>(null);
  const [draggingGuestId,  setDraggingGuestId]  = useState<string | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [canvasSize,       setCanvasSize]       = useState({ width: 1000, height: 650 });
  const [inviteCode,       setInviteCode]       = useState<string | null>(null);
  const [inviteCopied,     setInviteCopied]     = useState(false);

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

  async function handleGenerateInvite() {
    try {
      const code = await generateInvite({ workspaceId });
      setInviteCode(code);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not generate invite');
    }
  }

  function handleCopyInvite() {
    if (!inviteCode) return;
    const url = `${window.location.origin}/invite?code=${inviteCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0 z-10">
        <span className="font-semibold text-gray-800 text-sm mr-1">Avow</span>
        <span className="text-gray-300 text-sm">·</span>
        <span className="text-gray-500 text-sm mr-3">
          {workspace?.name ?? 'Seating Planner'}
        </span>

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

        {/* Invite */}
        {!inviteCode ? (
          <button
            onClick={handleGenerateInvite}
            className="text-sm px-3 py-1.5 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Invite partner
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <code className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded font-mono">
              {`/invite?code=${inviteCode}`}
            </code>
            <button
              onClick={handleCopyInvite}
              className="text-xs px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              {inviteCopied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        )}

        {/* Right side: stats + sign out */}
        <div className="ml-auto flex items-center gap-4">
          <div className="text-xs text-gray-400">
            {tables.length} table{tables.length !== 1 ? 's' : ''} ·{' '}
            {guests.length} guests ·{' '}
            {assignments.length} seated
          </div>
          <button
            onClick={async () => { await signOut(); router.push('/auth'); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Canvas + guest panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
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
    </div>
  );
}

// ── Root page — auth guard + workspace routing ────────────────────────────────

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<Id<'workspaces'> | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <Centered><p className="text-sm text-gray-400">Loading…</p></Centered>;
  }

  if (!isAuthenticated) {
    return null; // redirect in progress
  }

  if (!workspaceId) {
    return <WorkspaceScreen onSelect={setWorkspaceId} />;
  }

  return <Planner workspaceId={workspaceId} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      {children}
    </div>
  );
}
