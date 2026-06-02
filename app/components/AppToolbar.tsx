'use client';

/**
 * AppToolbar — persistent top bar across all modules. Wordmark, workspace name,
 * invite-partner flow, live workspace stats, switch/sign-out. Reads the active
 * workspace from WorkspaceContext.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { useWorkspace } from './WorkspaceContext';

export default function AppToolbar({ canSwitch }: { canSwitch: boolean }) {
  const { workspaceId, workspaceName, switchWorkspace } = useWorkspace();

  const tables      = useQuery(api.tables.list,          { workspaceId }) ?? [];
  const guests      = useQuery(api.guests.list,          { workspaceId }) ?? [];
  const assignments = useQuery(api.seatAssignments.list, { workspaceId }) ?? [];

  const generateInvite = useMutation(api.workspaces.generateInvite);
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

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

  return (
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

      {/* Right side: stats + switch + account + sign out */}
      <div className="ml-auto flex items-center gap-4">
        <div className="text-xs text-bg/45">
          {tables.length} table{tables.length !== 1 ? 's' : ''} ·{' '}
          {guests.length} guest{guests.length !== 1 ? 's' : ''} ·{' '}
          {assignments.length} seated
        </div>
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
  );
}
