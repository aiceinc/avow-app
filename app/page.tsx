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
import Wordmark from './components/Wordmark';
import AppFooter from './components/AppFooter';
import TableShapeIcon from './components/TableShapeIcon';
import { TEMPLATES, TemplateKey } from './lib/templates';

const SeatingCanvas = dynamic(() => import('./components/SeatingCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-bg">
      <p className="text-sm text-ink-faint">Loading canvas…</p>
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
    return <Centered><p className="text-sm text-ink-faint">Loading…</p></Centered>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-rule w-full max-w-sm p-8 animate-fade-in">
          <div className="text-center mb-8">
            <Wordmark className="text-3xl" />
            <p className="text-sm text-ink-faint mt-1.5">Wedding Planner</p>
          </div>

        {/* Existing workspaces */}
        {workspaces.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-ink-faint mb-3">Your workspaces</p>
            <div className="space-y-2">
              {workspaces.map(ws => (
                <button
                  key={ws._id}
                  onClick={() => onSelect(ws._id)}
                  className="w-full text-left px-4 py-3 border border-rule rounded-lg hover:border-accent hover:bg-bg-tint transition-colors"
                >
                  <div className="text-sm font-medium text-ink">{ws.name}</div>
                  <div className="text-xs text-ink-faint mt-0.5">
                    {ws.members.length === 1 ? '1 member' : `${ws.members.length} members`}
                  </div>
                </button>
              ))}
            </div>
            <div className="my-6 border-t border-rule" />
          </div>
        )}

        {/* Create workspace form */}
        <p className="text-xs font-medium text-ink-faint mb-3">
          {workspaces.length === 0 ? 'Create your first workspace' : 'Create another workspace'}
        </p>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Alex & Jordan's Wedding"
            className="app-input w-full text-sm px-3 py-2.5"
          />
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="btn btn-primary w-full text-sm py-2.5"
          >
            {creating ? 'Creating…' : 'Create workspace'}
          </button>
        </form>

          <button
            onClick={async () => { await signOut(); router.push('/auth'); }}
            className="mt-6 w-full text-xs text-ink-faint hover:text-ink-soft transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
      <AppFooter />
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

  function handleResetAll() {
    if (tables.length === 0) return;
    showConfirm(
      'Reset the layout? This removes all tables and their seat assignments.',
      async () => {
        closeModal();
        setSelectedTableId(null);
        await clearAll({ workspaceId });
      },
      'Reset all',
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
    <div className="flex flex-col h-screen overflow-hidden bg-bg">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-rule bg-bg/80 backdrop-blur-sm shrink-0 z-10">
        <Wordmark className="text-lg mr-1" />
        <span className="text-ink-faint/50 text-sm">·</span>
        <span className="text-ink-soft text-sm mr-3">
          {workspace?.name ?? 'Seating Planner'}
        </span>

        {/* Invite */}
        {!inviteCode ? (
          <button
            onClick={handleGenerateInvite}
            className="btn btn-secondary text-sm px-3 py-1.5"
          >
            Invite your partner
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <code className="text-xs bg-bg-tint border border-accent-soft text-ink-soft px-2 py-1 rounded font-mono">
              {`/invite?code=${inviteCode}`}
            </code>
            <button
              onClick={handleCopyInvite}
              className="btn btn-secondary text-xs px-2 py-1"
            >
              {inviteCopied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        )}

        {/* Right side: stats + sign out */}
        <div className="ml-auto flex items-center gap-4">
          <div className="text-xs text-ink-faint">
            {tables.length} table{tables.length !== 1 ? 's' : ''} ·{' '}
            {guests.length} guests ·{' '}
            {assignments.length} seated
          </div>
          <button
            onClick={async () => { await signOut(); router.push('/auth'); }}
            className="text-xs text-ink-faint hover:text-ink-soft transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Sidebar + canvas + guest panel ───────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

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

          {/* Reset all — pinned to the bottom */}
          <button
            onClick={handleResetAll}
            className="btn btn-danger w-full text-sm px-3 py-2 mt-auto"
          >
            Reset all
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

      <AppFooter />

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
    return <Centered><p className="text-sm text-ink-faint">Loading…</p></Centered>;
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
    <div className="min-h-screen flex items-center justify-center">
      {children}
    </div>
  );
}
