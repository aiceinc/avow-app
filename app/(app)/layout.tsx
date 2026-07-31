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
import { WORKSPACE_STORAGE_KEY as STORAGE_KEY } from '@/app/lib/config';

const LOADING_ENTITLEMENT: Entitlement = {
  status: 'loading',
  tier: null,
  canEdit: true, // don't flash the paywall before billing data loads
  paymentFailed: false,
  hasSubscription: false,
  trialEnd: null,
  trialDaysLeft: null,
  trialEligible: false, // don't flash "start your free trial" before it loads
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
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
  const isDemo = entitlement.status === 'locked' && entitlement.trialEligible;

  return (
    <WorkspaceContext.Provider
      value={{ workspaceId, workspaceName, partnerNames, switchWorkspace, entitlement, isDemo }}
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Turn the raw getEntitlement facts into the derived state used by the UI. */
function deriveEntitlement(
  e:
    | {
        hasSubscription: boolean;
        subStatus: string | null;
        paymentFailed: boolean;
        tier: string | null;
        isTrialing: boolean;
        trialEnd: number | null;
        trialEligible: boolean;
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd: number | null;
      }
    | undefined
): Entitlement {
  if (e === undefined) return LOADING_ENTITLEMENT;
  // A Stripe trial arrives as a live subscription (status `trialing`) and grants
  // full edit access at the chosen tier.
  const canEdit = e.hasSubscription;
  const status: Entitlement['status'] = e.hasSubscription
    ? e.paymentFailed
      ? 'past_due'
      : e.isTrialing
        ? 'trialing'
        : 'active'
    : 'locked';
  const tier = e.hasSubscription
    ? isTier(e.tier ?? '')
      ? (e.tier as Entitlement['tier'])
      : 'couple'
    : null;
  // Round UP so the last partial day still reads as "1 day left", never "0".
  const trialDaysLeft =
    e.isTrialing && e.trialEnd != null
      ? Math.max(0, Math.ceil((e.trialEnd - Date.now()) / DAY_MS))
      : null;
  return {
    status,
    tier,
    canEdit,
    paymentFailed: e.paymentFailed,
    hasSubscription: e.hasSubscription,
    trialEnd: e.trialEnd,
    trialDaysLeft,
    trialEligible: e.trialEligible,
    cancelAtPeriodEnd: e.cancelAtPeriodEnd,
    currentPeriodEnd: e.currentPeriodEnd,
  };
}
