'use client';

/**
 * WorkspaceContext — provides the active workspace to every module under the
 * (app) route-group layout. The layout selects/validates the workspace once and
 * shares it here, so switching tabs never loses workspace or auth state.
 *
 * It also carries the workspace's billing ENTITLEMENT (active / past-due /
 * locked) so any module can read `canEdit` and the shell can render the
 * payment-failed / paywall banners. There is no trial — access needs a plan.
 */

import { createContext, useContext } from 'react';
import { Id } from '@/convex/_generated/dataModel';
import type { Tier } from '@/convex/billingConfig';

/** Billing/access state for the active workspace. */
export type BillingStatus = 'loading' | 'active' | 'past_due' | 'locked';

export type Entitlement = {
  status: BillingStatus;
  /** Effective plan tier: the live subscription's tier, or null when locked
   *  (no subscription). Drives per-tier limits. */
  tier: Tier | null;
  /** False when there is no live subscription (read-only). */
  canEdit: boolean;
  /** A recent invoice failed to charge — prompt to update the card. */
  paymentFailed: boolean;
  /** A live (active / trialing / past-due) Stripe subscription exists. */
  hasSubscription: boolean;
};

export type WorkspaceContextValue = {
  workspaceId: Id<'workspaces'>;
  workspaceName: string;
  /** The couple's display names, derived from the workspace name. */
  partnerNames: { a: string; b: string };
  /** Clear the current selection and return to the workspace picker. */
  switchWorkspace: () => void;
  /** Billing entitlement for the active workspace. */
  entitlement: Entitlement;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within the (app) layout');
  }
  return ctx;
}

export default WorkspaceContext;
