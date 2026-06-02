import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { TRIAL_PERIOD_DAYS } from "./billingConfig";

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
export async function assertCanEdit(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<Id<"users">> {
  const userId = await assertMember(ctx, workspaceId);

  const ws = await ctx.db.get(workspaceId);
  // Still within the free trial → always allowed.
  if (ws && Date.now() < trialEndsAtFor(ws)) return userId;

  // Trial over: require a live subscription.
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .take(50);
  const live = subs.some((s) => EDIT_GRACE_STATUSES.includes(s.status));
  if (!live) {
    throw new Error(
      "Your free trial has ended. Subscribe to keep editing your wedding plans."
    );
  }
  return userId;
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
