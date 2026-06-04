import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  TRIAL_PERIOD_DAYS,
  TRIAL_TIER,
  type Tier,
  type Feature,
  isTier,
  tierHasFeature,
  guestCapFor,
  FEATURE_LABEL,
  FEATURE_MIN_TIER,
} from "./billingConfig";

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Subscription statuses that grant edit access (active, in good standing, or in
 *  the dunning grace window after a failed payment). */
const EDIT_GRACE_STATUSES = ["active", "trialing", "past_due"];

/**
 * Assert that the calling user is authenticated and a member of the given
 * workspace. Throws if either condition is not met.
 *
 * Returns the authenticated user's ID so callers don't need to re-derive it.
 */
export async function assertMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId_and_userId", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique();

  if (!member) throw new Error("Not a member of this workspace");

  return userId;
}

/**
 * Get the current authenticated user's ID, or throw if not authenticated.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

/** The unix-ms instant a workspace's free trial ends (creation + TRIAL_PERIOD_DAYS).
 *  The trial is app-managed and needs no card — see convex/billingConfig.ts. */
export function trialEndsAtFor(workspace: { _creationTime: number }): number {
  return workspace._creationTime + TRIAL_PERIOD_DAYS * DAY_MS;
}

/**
 * The HARD PAYWALL gate (v1.11.1). Assert the caller is a member AND the
 * workspace is allowed to make edits — i.e. it's still inside the free trial OR
 * has a live subscription (active / trialing / past-due grace). Otherwise the
 * trial has lapsed with no subscription and the workspace is READ-ONLY: this
 * throws, blocking every create/update/delete at the source. Reads are never
 * gated (members can always VIEW what they created).
 *
 * Use in place of assertMember in mutations that create or modify content.
 * (Mutation-only: relies on Date.now(), which Convex permits in mutations.)
 */
const TRIAL_ENDED_MESSAGE =
  "Your free trial has ended. Subscribe to keep editing your wedding plans.";

/**
 * Compute a workspace's effective tier + edit access (mutation-time; uses
 * Date.now). `tier` is the live subscription's tier, or TRIAL_TIER while in the
 * free trial, or null when locked (trial over, no live subscription).
 */
/** Max weddings (workspaces) a single Planner plan covers. */
export const PLANNER_WORKSPACE_LIMIT = 10;

/** True if `userId` holds an active (incl. dunning-grace) Planner subscription —
 *  i.e. they are a Planner account whose plan covers up to PLANNER_WORKSPACE_LIMIT
 *  weddings. Works in query or mutation context. */
export async function userHasActivePlanner(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .take(20);
  return subs.some(
    (s) => s.tier === "planner" && EDIT_GRACE_STATUSES.includes(s.status)
  );
}

/** True if any member of the workspace is a Planner account (so the workspace is
 *  covered by that planner's plan — Pro-level features). */
export async function workspaceHasPlannerMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<boolean> {
  const members = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .take(5);
  for (const m of members) {
    if (await userHasActivePlanner(ctx, m.userId)) return true;
  }
  return false;
}

async function computeAccess(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<{ tier: Tier | null; canEdit: boolean }> {
  // Account-level Planner coverage is the strongest grant — a member's Planner
  // plan unlocks Pro-level features here regardless of this workspace's own sub.
  if (await workspaceHasPlannerMember(ctx, workspaceId)) {
    return { tier: "planner", canEdit: true };
  }
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .take(50);
  const live = subs.find((s) => EDIT_GRACE_STATUSES.includes(s.status));
  if (live) {
    return { tier: isTier(live.tier) ? live.tier : "standard", canEdit: true };
  }
  const ws = await ctx.db.get(workspaceId);
  if (ws && Date.now() < trialEndsAtFor(ws)) {
    return { tier: TRIAL_TIER, canEdit: true };
  }
  return { tier: null, canEdit: false };
}

export async function assertCanEdit(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<Id<"users">> {
  const userId = await assertMember(ctx, workspaceId);
  const { canEdit } = await computeAccess(ctx, workspaceId);
  if (!canEdit) throw new Error(TRIAL_ENDED_MESSAGE);
  return userId;
}

/**
 * Like assertCanEdit, but also requires that the workspace's effective tier
 * includes a premium `feature` (seating / timeline / vendors). Used to gate the
 * Pro-only module mutations. Throws the trial-ended message when locked, or an
 * upgrade message when the tier simply doesn't include the feature.
 */
export async function assertTierFeature(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  feature: Feature
): Promise<Id<"users">> {
  const userId = await assertMember(ctx, workspaceId);
  const { tier, canEdit } = await computeAccess(ctx, workspaceId);
  if (!canEdit || !tier) throw new Error(TRIAL_ENDED_MESSAGE);
  if (!tierHasFeature(tier, feature)) {
    throw new Error(
      `${FEATURE_LABEL[feature]} is a ${titleCase(FEATURE_MIN_TIER[feature])} feature. ` +
        `Upgrade your plan to use it.`
    );
  }
  return userId;
}

/**
 * Enforce the tier's guest cap before creating a guest. Keeps existing data
 * (over-cap workspaces aren't trimmed) — only NEW guests past the cap are
 * blocked. Call after assertCanEdit in guests.create.
 */
export async function assertGuestCapacity(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<void> {
  const { tier } = await computeAccess(ctx, workspaceId);
  const cap = tier ? guestCapFor(tier) : 0;
  if (cap === null) return; // unlimited
  const existing = await ctx.db
    .query("guests")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .take(cap + 1);
  if (existing.length >= cap) {
    throw new Error(
      `Your plan is limited to ${cap} guests. Upgrade to Pro for unlimited guests.`
    );
  }
}

/**
 * Every table that holds workspace-scoped data, each indexed by `by_workspaceId`.
 * This is the authoritative deletion graph for a workspace — used by account
 * self-deletion (convex/account.ts) and the retention cron (convex/retention.ts).
 *
 * ⚠️ If you add a new workspace-scoped table to the schema, ADD IT HERE too, or
 * its rows will be orphaned on deletion. (Auth tables — users/authSessions/
 * authAccounts/etc. — are NOT here; those are per-user and handled separately.)
 */
const WORKSPACE_SCOPED_TABLES = [
  "workspaceMembers",
  "guests",
  "tables",
  "seatAssignments",
  "cursors",
  "budgetSettings",
  "budgetCategories",
  "budgetLineItems",
  "vendorCategories",
  "vendors",
  "timelineItems",
  "weddingSites",
  "tasks",
  "notes",
  "subscriptions",
] as const;

/**
 * Hard-delete ALL data belonging to a workspace, across every workspace-scoped
 * table, then the workspace row itself. Idempotent and complete. Deletes in
 * bounded batches to stay within Convex transaction limits.
 *
 * Caller is responsible for authorization — this helper does no auth check.
 */
export async function purgeWorkspace(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<void> {
  for (const table of WORKSPACE_SCOPED_TABLES) {
    // Re-query after each batch: rows are deleted, so the next page is fresh.
    for (;;) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
        .take(500);
      if (rows.length === 0) break;
      for (const row of rows) await ctx.db.delete(row._id);
    }
  }

  // Finally the workspace row itself, if it still exists.
  const ws = await ctx.db.get(workspaceId);
  if (ws) await ctx.db.delete(workspaceId);
}
