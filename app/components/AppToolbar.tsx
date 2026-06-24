'use client';

/**
 * AppToolbar — persistent top bar across all modules. Wordmark, workspace name,
 * invite-partner flow, live workspace stats, a "Switch workspace" hover dropdown
 * (lists every wedding in the account + "+ New wedding"), and sign-out. Reads the
 * active workspace from WorkspaceContext.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { useWorkspace } from './WorkspaceContext';
import { errorMessage } from '@/app/lib/errors';

const STORAGE_KEY = 'avow:workspaceId';

export default function AppToolbar() {
  const { workspaceId, workspaceName, entitlement } = useWorkspace();

  const tables      = useQuery(api.tables.list,          { workspaceId }) ?? [];
  const guests      = useQuery(api.guests.list,          { workspaceId }) ?? [];
  const assignments = useQuery(api.seatAssignments.list, { workspaceId }) ?? [];
  const myWorkspaces = useQuery(api.workspaces.listMine) ?? [];

  // The couple tier covers a single wedding, so there's nothing to switch
  // between — hide the switcher unless they've actually been added to another
  // workspace (planner tiers always keep it, to manage + add weddings).
  const showWorkspaceSwitcher = !(entitlement.tier === 'couple' && myWorkspaces.length <= 1);

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
      alert(errorMessage(err, 'Could not generate invite'));
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

  function switchTo(id: string) {
    if (id === workspaceId) return;
    window.localStorage.setItem(STORAGE_KEY, id);
    window.location.assign('/home');
  }

  function openCreate() {
    setNewName('');
    setNewError(null);
    setCreating(true);
  }

  async function handleCreateWorkspace() {
    const name = newName.trim();
    if (!name || savingNew) return;
    setSavingNew(true);
    setNewError(null);
    try {
      const id = await createWorkspace({ name });
      window.localStorage.setItem(STORAGE_KEY, id);
      window.location.assign('/home');
    } catch (err: unknown) {
      setNewError(errorMessage(err, 'Could not create this wedding.'));
      setSavingNew(false);
    }
  }

  return (
    <>
      <div className="relative z-30 flex items-center gap-2 px-6 sm:px-10 h-14 bg-ink shrink-0">
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

        {/* Right side: stats + switch-workspace dropdown + account + sign out */}
        <div className="ml-auto flex items-center gap-4">
          <div className="text-xs text-bg/45">
            {tables.length} table{tables.length !== 1 ? 's' : ''} ·{' '}
            {guests.length} guest{guests.length !== 1 ? 's' : ''} ·{' '}
            {assignments.length} seated
          </div>

          {/* Switch workspace — hover dropdown (hidden for single-workspace couples) */}
          {showWorkspaceSwitcher && (
          <div className="relative group">
            <button className="flex items-center gap-1 text-xs text-bg/60 hover:text-bg transition-colors">
              Switch workspace
              <svg width="9" height="9" viewBox="0 0 10 6" fill="none" aria-hidden>
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* pt-2 is a hover bridge so the menu stays open between button and list */}
            <div className="absolute right-0 top-full pt-2 hidden group-hover:block z-50">
              <div className="w-64 bg-bg rounded-lg shadow-xl border border-rule py-1.5 max-h-80 overflow-y-auto">
                <div className="px-3 py-1 text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">Your weddings</div>
                {myWorkspaces.map((w) => (
                  <button
                    key={w._id}
                    onClick={() => switchTo(w._id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-tint transition-colors flex items-center gap-2 ${
                      w._id === workspaceId ? 'text-ink font-medium' : 'text-ink-soft'
                    }`}
                  >
                    <span className="flex-1 truncate">{w.name}</span>
                    {w._id === workspaceId && <span className="text-accent text-[0.6rem]" aria-label="current">●</span>}
                  </button>
                ))}
                <div className="border-t border-rule mt-1 pt-1">
                  <button
                    onClick={openCreate}
                    className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-bg-tint transition-colors"
                  >
                    + New wedding
                  </button>
                </div>
              </div>
            </div>
          </div>
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
              Start planning another wedding. Planner plans cover multiple weddings under one subscription.
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
