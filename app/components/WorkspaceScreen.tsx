'use client';

/**
 * WorkspaceScreen — workspace picker + create form, shown by the (app) layout
 * when no workspace is active (0 workspaces, 2+ with none chosen, or after the
 * user taps "Switch"). Auto-selection of a lone workspace is handled by the
 * layout's gate, not here.
 */

import { useState, FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { errorMessage } from '@/app/lib/errors';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import Wordmark from './Wordmark';
import AppFooter from './AppFooter';

type WorkspaceSummary = {
  _id: Id<'workspaces'>;
  name: string;
  members: { userId: string; email: string | null; name: string | null }[];
};

export default function WorkspaceScreen({
  workspaces,
  onSelect,
}: {
  workspaces: WorkspaceSummary[];
  onSelect: (id: Id<'workspaces'>) => void;
}) {
  const createWorkspace = useMutation(api.workspaces.create);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signOut } = useAuthActions();
  const router = useRouter();

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const id = await createWorkspace({ name: name.trim() });
      onSelect(id);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create workspace'));
    } finally {
      setCreating(false);
    }
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
            {error && <p className="text-xs text-red-600">{error}</p>}
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
