'use client';

/**
 * AppToolbar — persistent top bar across all modules. Wordmark, workspace name,
 * invite-partner flow, live workspace stats, new-wedding, switch/sign-out. Reads
 * the active workspace from WorkspaceContext.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { useWorkspace } from './WorkspaceContext';

const STORAGE_KEY = 'avow:workspaceId';

export default function AppToolbar({ canSwitch }: { canSwitch: boolean }) {
  const { workspaceId, workspaceName, switchWorkspace } = useWorkspace();

  const tables      = useQuery(api.tables.list,          { workspaceId }) ?? [];
  const guests      = useQuery(api.guests.list,          { workspaceId }) ?? [];
  const assignments = useQuery(api.seatAssignments.list, { workspaceId }) ?? [];

  const generateInvite = useMutation(api.workspaces.generateInvite);
  const createWorkspace = useMutation(api.workspaces.create);
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // New-wedding modal
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  async function handleGenerateInvite() {
    try {
      setInviteCode(await generateInvite({ workspaceId }));
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

  async function handleCreateWorkspace() {
    const name = newName.trim();
    if (!name || savingNew) return;
    setSavingNew(true);
    setNewError(null);
    try {
      const id = await createWorkspace({ name });
      // Select the new wedding and reload into it.
      window.localStorage.setItem(STORAGE_KEY, id);
      window.location.assign('/home');
    } catch (err: unknown) {
      setNewError(err instanceof Error ? err.message : 'Could not create this wedding.');
      setSavingNew(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 px-6 sm:px-10 h-14 bg-ink shrink-0 z-10">
        <Link href="/home" aria-label="Go to Home" className="shrink-0 hover:opacity-80 transition-opacity">
          <span className="wordmark text-xl" style={{ color: 'var(--bg)' }}>
            avow<span className="dot" />
          </span>
        </Link>
        <span className="text-bg/30 text-sm">·</span>
        <span className="text-bg/70 text-sm mr-3">{workspaceName}</span>

        {/* Invite partner */}
        {!inviteCode ? (
          <button
            onClick={handleGenerateInvite}
            className="text-[0.78rem] font-medium tracking-wide text-bg border border-bg/35 rounded-sm px-3.5 py-1.5 hover:bg-bg hover:text-ink transition-colors"
          >
            Invite your partner
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <code className="text-xs bg-bg/10 border border-bg/25 text-bg/80 px-2 py-1 rounded font-mono">
              {`/invite?code=${inviteCode}`}
            </code>
            <button
              onClick={handleCopyInvite}
              className="text-[0.78rem] text-bg/70 hover:text-bg transition-colors px-1"
            >
              {inviteCopied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        )}

        {/* Right side: stats + new wedding + switch + account + sign out */}
        <div className="ml-auto flex items-center gap-4">
          <div className="text-xs text-bg/45">
            {tables.length} table{tables.length !== 1 ? 's' : ''} ·{' '}
            {guests.length} guest{guests.length !== 1 ? 's' : ''} ·{' '}
            {assignments.length} seated
          </div>
          <button
            onClick={() => { setNewName(''); setNewError(null); setCreating(true); }}
            className="text-xs text-bg/60 hover:text-bg transition-colors"
          >
            + New wedding
          </button>
          {canSwitch && (
            <button
              onClick={switchWorkspace}
              className="text-xs text-bg/60 hover:text-bg transition-colors"
            >
              Switch
            </button>
          )}
          <Link
            href="/account"
            className="text-xs text-bg/60 hover:text-bg transition-colors"
          >
            Account
          </Link>
          <button
            onClick={async () => { await signOut(); router.push('/auth'); }}
            className="text-xs text-bg/60 hover:text-bg transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* New-wedding modal */}
      {creating && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => { if (!savingNew) setCreating(false); }}
        >
          <div className="bg-bg rounded-xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-lg text-ink mb-1">New wedding</h2>
            <p className="text-xs text-ink-faint mb-3">
              Start planning another wedding. It begins its own 14-day free trial unless it&rsquo;s covered by your plan.
            </p>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateWorkspace(); if (e.key === 'Escape' && !savingNew) setCreating(false); }}
              placeholder="e.g. Sam & Riley's Wedding"
              className="app-input w-full text-sm px-3 py-2.5 mb-3"
            />
            {newError && <p className="text-xs text-red-600 mb-3">{newError}</p>}
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setCreating(false)} disabled={savingNew} className="btn btn-secondary text-sm px-4 py-2">Cancel</button>
              <button
                onClick={handleCreateWorkspace}
                disabled={savingNew || !newName.trim()}
                className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingNew ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
