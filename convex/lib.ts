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
