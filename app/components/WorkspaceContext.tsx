'use client';

/**
 * WorkspaceContext — provides the active workspace to every module under the
 * (app) route-group layout. The layout selects/validates the workspace once and
 * shares it here, so switching tabs never loses workspace or auth state.
 *
 * As of v1.11.1 it also carries the workspace's billing ENTITLEMENT (trial /
 * active / past-due / locked) so any module can read `canEdit` and the shell can
 * render the trial-countdown / payment-failed / paywall banners.
 */

import { createContext, useContext } from 'react';
import { Id } from '@/convex/_generated/dataModel';
import type { Tier } from '@/convex/billingConfig';

/** Billing/access state for the active workspace. */
export type BillingStatus = 'loading' | 'trial' | 'active' | 'past_due' | 'locked';

export type Entitlement = {
  status: BillingStatus;
  /** Effective plan tier: the live subscription's tier, 'standard' during the
   *  free trial, or null when locked. Drives per-tier feature gating. */
  tier: Tier | null;
  /** False only when the trial has lapsed with no live subscription (read-only). */
  canEdit: boolean;
  /** Whole days remaining in the free trial (0 once expired). */
  trialDaysLeft: number;
  /** Unix-ms instant the free trial ends, or null while loading. */
  trialEndsAt: number | null;
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
