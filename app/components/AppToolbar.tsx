'use client';

/**
 * AppToolbar — persistent top bar across all modules. Wordmark, workspace name,
 * invite-partner flow, live workspace stats, switch/sign-out. Reads the active
 * workspace from WorkspaceContext.
 */

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import Wordmark from './Wordmark';
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
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-rule bg-bg/80 backdrop-blur-sm shrink-0 z-10">
      <Wordmark className="text-lg mr-1" />
      <span className="text-ink-faint/50 text-sm">·</span>
      <span className="text-ink-soft text-sm mr-3">{workspaceName}</span>

      {/* Invite partner */}
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

      {/* Right side: stats + switch + sign out */}
      <div className="ml-auto flex items-center gap-4">
        <div className="text-xs text-ink-faint">
          {tables.length} table{tables.length !== 1 ? 's' : ''} ·{' '}
          {guests.length} guest{guests.length !== 1 ? 's' : ''} ·{' '}
          {assignments.length} seated
        </div>
        {canSwitch && (
          <button
            onClick={switchWorkspace}
            className="text-xs text-ink-faint hover:text-ink-soft transition-colors"
          >
            Switch
          </button>
        )}
        <button
          onClick={async () => { await signOut(); router.push('/auth'); }}
          className="text-xs text-ink-faint hover:text-ink-soft transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
