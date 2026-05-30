import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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
