import { mutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { purgeWorkspace } from "./lib";

/**
 * Account + data self-deletion (v1.9.0).
 *
 * `deleteMyAccount` is the one user-facing, irreversible "delete my account and
 * data" capability. It:
 *   1. For every workspace the user belongs to, removes their membership. If
 *      that leaves the workspace with NO members, the entire workspace graph is
 *      purged (see purgeWorkspace). A workspace with a remaining member survives
 *      for that partner — see the Q1 design flag in the brief.
 *   2. Hard-deletes the user's auth footprint (sessions, refresh tokens,
 *      accounts, verification codes, rate-limit rows, and the user row).
 *
 * Hard delete — no tombstones. The user identity is derived server-side; this
 * function never takes a userId argument.
 */

/**
 * Hard-delete every auth record tied to a user.
 *
 * Covered: authSessions (+ their authRefreshTokens), authAccounts (+ their
 * authVerificationCodes), best-effort authRateLimits (keyed by the user's email
 * identifier), and the users row.
 *
 * NOT covered (deliberate): authVerifiers — OAuth/PKCE artifacts with no userId
 * link and no index on sessionId; the Password provider never creates them.
 * authRateLimits identifiers are namespaced by the auth library, so the email
 * match is best-effort; these rows are ephemeral throttle counters that expire
 * on their own. Both are flagged in the brief writeup.
 */
async function deleteUserAuth(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  // Sessions and their refresh tokens.
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .take(200);
  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .take(500);
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }

  // Accounts and their verification codes.
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(100);
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(200);
    for (const code of codes) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }

  // Best-effort: rate-limit rows keyed by the user's email identifier.
  const user = await ctx.db.get(userId);
  const email = user?.email;
  if (email) {
    const limits = await ctx.db
      .query("authRateLimits")
      .withIndex("identifier", (q) => q.eq("identifier", email))
      .take(100);
    for (const limit of limits) await ctx.db.delete(limit._id);
  }

  // Finally the user row itself.
  await ctx.db.delete(userId);
}

export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    // For each workspace this user belongs to: drop their membership, then purge
    // the workspace only if no members remain (shared weddings survive).
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);

    for (const membership of memberships) {
      const workspaceId = membership.workspaceId;
      await ctx.db.delete(membership._id);

      const remaining = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
        .take(1);
      if (remaining.length === 0) {
        await purgeWorkspace(ctx, workspaceId);
      }
    }

    // Remove the user's auth footprint last.
    await deleteUserAuth(ctx, userId);
    return null;
  },
});
