'use client';

/**
 * (app)/layout.tsx — the authenticated app shell.
 *
 * Responsibilities (done once, shared by every module route):
 *  - Auth guard: not signed in → redirect to /auth.
 *  - Workspace selection: validate against membership, auto-select a lone
 *    workspace, persist the choice to localStorage, otherwise show the picker.
 *  - Provide the active workspace + billing entitlement via WorkspaceContext.
 *  - Render the persistent toolbar + module tabs + billing banner around {children}.
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
import WorkspaceContext, { type Entitlement } from '@/app/components/WorkspaceContext';
import WorkspaceScreen from '@/app/components/WorkspaceScreen';
import { derivePartnerNames } from '@/app/lib/guests';
import AppToolbar from '@/app/components/AppToolbar';
import ModuleTabs from '@/app/components/ModuleTabs';
import BillingBanner from '@/app/components/BillingBanner';
import AppFooter from '@/app/components/AppFooter';
import { isTier } from '@/convex/billingConfig';

const STORAGE_KEY = 'avow:workspaceId';

const LOADING_ENTITLEMENT: Entitlement = {
  status: 'loading',
  tier: null,
  canEdit: true, // don't flash the paywall before billing data loads
  paymentFailed: false,
  hasSubscription: false,
};

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
    <AppShell
      workspaceId={effectiveId}
      workspaceName={active.name}
      partnerNames={partnerNames}
      switchWorkspace={switchWorkspace}
    >
      {children}
    </AppShell>
  );
}

/**
 * The shell proper — only mounted once a workspace is selected, so the billing
 * entitlement query runs with a real workspaceId (no conditional hooks above).
 */
function AppShell({
  workspaceId,
  workspaceName,
  partnerNames,
  switchWorkspace,
  children,
}: {
  workspaceId: Id<'workspaces'>;
  workspaceName: string;
  partnerNames: { a: string; b: string };
  switchWorkspace: () => void;
  children: React.ReactNode;
}) {
  const ent = useQuery(api.subscriptions.getEntitlement, { workspaceId });
  const entitlement = deriveEntitlement(ent);

  return (
    <WorkspaceContext.Provider
      value={{ workspaceId, workspaceName, partnerNames, switchWorkspace, entitlement }}
    >
      <div className="flex flex-col h-screen overflow-hidden bg-bg">
        <AppToolbar />
        <ModuleTabs />
        <BillingBanner entitlement={entitlement} />
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {children}
        </div>
        {/* Pinned to the bottom of the window across every app route */}
        <AppFooter />
      </div>
    </WorkspaceContext.Provider>
  );
}

/** Turn the raw getEntitlement facts into the derived state used by the UI. */
function deriveEntitlement(
  e:
    | {
        hasSubscription: boolean;
        subStatus: string | null;
        paymentFailed: boolean;
        tier: string | null;
      }
    | undefined
): Entitlement {
  if (e === undefined) return LOADING_ENTITLEMENT;
  // No trial: edit access requires a live subscription.
  const canEdit = e.hasSubscription;
  const status: Entitlement['status'] = e.hasSubscription
    ? e.paymentFailed
      ? 'past_due'
      : 'active'
    : 'locked';
  const tier = e.hasSubscription
    ? isTier(e.tier ?? '')
      ? (e.tier as Entitlement['tier'])
      : 'couple'
    : null;
  return {
    status,
    tier,
    canEdit,
    paymentFailed: e.paymentFailed,
    hasSubscription: e.hasSubscription,
  };
}
