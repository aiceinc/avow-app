import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  TRIAL_PERIOD_DAYS,
  TRIAL_TIER,
  type Tier,
  type Feature,
  isTier,
  isPlannerTier,
  weddingLimitFor,
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
  if (!userId) throw new ConvexError("Not authenticated");

  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId_and_userId", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique();

  if (!member) throw new ConvexError("Not a member of this workspace");

  return userId;
}

/**
 * Get the current authenticated user's ID, or throw if not authenticated.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not authenticated");
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
/** The highest active (incl. dunning-grace) Planner tier `userId` holds, or null
 *  if they aren't a Planner account. Planner tiers are account-level and cover
 *  multiple weddings (see weddingLimitFor). Works in query or mutation context. */
export async function userActivePlannerTier(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<Tier | null> {
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .take(20);
  const active = subs.filter(
    (s) =>
      EDIT_GRACE_STATUSES.includes(s.status) &&
      isTier(s.tier) &&
      isPlannerTier(s.tier as Tier)
  );
  if (active.some((s) => s.tier === "planner_max")) return "planner_max";
  if (active.some((s) => s.tier === "planner_pro")) return "planner_pro";
  return null;
}

/** The Planner tier covering a workspace (when a member holds a Planner plan),
 *  preferring the highest — or null if no member is a Planner account. */
export async function workspacePlannerCoverage(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<Tier | null> {
  const members = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .take(5);
  let best: Tier | null = null;
  for (const m of members) {
    const pt = await userActivePlannerTier(ctx, m.userId);
    if (pt === "planner_max") return "planner_max";
    if (pt === "planner_pro") best = "planner_pro";
  }
  return best;
}

/** How many weddings the user is entitled to create/manage: their Planner tier's
 *  limit, or 1 for a Couple / trial user. */
export async function weddingLimitForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<number> {
  const pt = await userActivePlannerTier(ctx, userId);
  return pt ? weddingLimitFor(pt) : 1;
}

async function computeAccess(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<{ tier: Tier | null; canEdit: boolean }> {
  // Account-level Planner coverage is the strongest grant — a member's Planner
  // plan covers this workspace regardless of its own subscription.
  const coverage = await workspacePlannerCoverage(ctx, workspaceId);
  if (coverage) return { tier: coverage, canEdit: true };

  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .take(50);
  const live = subs.find((s) => EDIT_GRACE_STATUSES.includes(s.status));
  if (live) {
    return { tier: isTier(live.tier) ? live.tier : "couple", canEdit: true };
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
  if (!canEdit) throw new ConvexError(TRIAL_ENDED_MESSAGE);
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
  if (!canEdit || !tier) throw new ConvexError(TRIAL_ENDED_MESSAGE);
  if (!tierHasFeature(tier, feature)) {
    throw new ConvexError(
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
    throw new ConvexError(
      `Your plan is limited to ${cap} guests. Upgrade your plan for more.`
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
