'use client';

/**
 * (app)/layout.tsx — the authenticated app shell.
 *
 * Responsibilities (done once, shared by every module route):
 *  - Auth guard: not signed in → redirect to /auth.
 *  - Workspace selection: validate against membership, auto-select a lone
 *    workspace, persist the choice to localStorage, otherwise show the picker.
 *  - Provide the active workspace via WorkspaceContext.
 *  - Render the persistent toolbar + module tabs + footer around {children}.
 *
 * Because Next.js layouts don't remount when navigating between their child
 * routes, the selected workspace and all Convex subscriptions survive tab
 * switches — no reload, no re-auth.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import WorkspaceContext from '@/app/components/WorkspaceContext';
import WorkspaceScreen from '@/app/components/WorkspaceScreen';
import { derivePartnerNames } from '@/app/lib/guests';
import AppToolbar from '@/app/components/AppToolbar';
import ModuleTabs from '@/app/components/ModuleTabs';
import AppFooter from '@/app/components/AppFooter';

const STORAGE_KEY = 'avow:workspaceId';

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center">{children}</div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/auth');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return <Centered><p className="text-sm text-ink-faint">Loading…</p></Centered>;
  }
  if (!isAuthenticated) return null; // redirect in progress

  return <WorkspaceGate>{children}</WorkspaceGate>;
}

function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const workspaces = useQuery(api.workspaces.listMine);
  const [selectedId, setSelectedId] = useState<Id<'workspaces'> | null>(null);

  // Restore last-used workspace so deep links (/seating, /guests) and refreshes
  // don't drop the user back to the picker.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedId(saved as Id<'workspaces'>);
  }, []);

  function select(id: Id<'workspaces'>) {
    window.localStorage.setItem(STORAGE_KEY, id);
    setSelectedId(id);
  }

  function switchWorkspace() {
    window.localStorage.removeItem(STORAGE_KEY);
    setSelectedId(null);
  }

  if (workspaces === undefined) {
    return <Centered><p className="text-sm text-ink-faint">Loading…</p></Centered>;
  }

  // Only honour a selection the user is actually a member of; otherwise
  // auto-select a lone workspace, else fall through to the picker. This keeps a
  // stale localStorage id from ever reaching membership-gated queries.
  const validSelected =
    selectedId && workspaces.some(w => w._id === selectedId) ? selectedId : null;
  const effectiveId =
    validSelected ?? (workspaces.length === 1 ? workspaces[0]._id : null);

  if (!effectiveId) {
    return <WorkspaceScreen workspaces={workspaces} onSelect={select} />;
  }

  const active = workspaces.find(w => w._id === effectiveId)!;
  const partnerNames = derivePartnerNames(active.name);

  return (
    <WorkspaceContext.Provider
      value={{ workspaceId: effectiveId, workspaceName: active.name, partnerNames, switchWorkspace }}
    >
      <div className="flex flex-col h-screen overflow-hidden bg-bg">
        <AppToolbar canSwitch={workspaces.length > 1} />
        <ModuleTabs />
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {children}
        </div>
        <AppFooter />
      </div>
    </WorkspaceContext.Provider>
  );
}
