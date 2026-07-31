'use client';

/**
 * WorkspaceContext — provides the active workspace to every module under the
 * (app) route-group layout. The layout selects/validates the workspace once and
 * shares it here, so switching tabs never loses workspace or auth state.
 *
 * It also carries the workspace's billing ENTITLEMENT (trialing / active /
 * past-due / locked) so any module can read `canEdit` and the shell can render
 * the trial countdown, payment-failed, and paywall banners.
 */

import { createContext, useContext } from 'react';
import { Id } from '@/convex/_generated/dataModel';
import type { Tier } from '@/convex/billingConfig';

/** Billing/access state for the active workspace. */
export type BillingStatus = 'loading' | 'trialing' | 'active' | 'past_due' | 'locked';

export type Entitlement = {
  status: BillingStatus;
  /** Effective plan tier: the live subscription's tier (a trial carries the tier
   *  the user chose), or null when locked. Drives per-tier limits. */
  tier: Tier | null;
  /** False when there is no live subscription (read-only). A trial grants edit. */
  canEdit: boolean;
  /** A recent invoice failed to charge — prompt to update the card. */
  paymentFailed: boolean;
  /** A live (active / trialing / past-due) Stripe subscription exists. */
  hasSubscription: boolean;
  /** Unix ms the free trial converts to paid, or null when not trialing. */
  trialEnd: number | null;
  /** Whole days remaining in the trial (>= 0), or null when not trialing. */
  trialDaysLeft: number | null;
  /** The user has never used their one free trial — drives CTA copy
   *  ("Start your free trial" vs "Choose a plan"). */
  trialEligible: boolean;
  /** Cancelled but still running: access continues until the trial/period ends,
   *  then the subscription LAPSES rather than renewing. */
  cancelAtPeriodEnd: boolean;
  /** Unix ms the paid period ends, or null while trialing (use trialEnd). */
  currentPeriodEnd: number | null;
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
  /** Locked AND never used a trial — modules render illustrative example
   *  content instead of the (real, empty) workspace so it isn't a blank page. */
  isDemo: boolean;
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
