import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember } from "./lib";

/**
 * Return all guests in a workspace.
 * Enforces that the calling user is a member of the workspace.
 */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("guests")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("asc")
      .take(200);
  },
});

/**
 * Return a single guest by ID.
 * Verifies the guest belongs to a workspace the caller is a member of.
 */
export const get = query({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return null;
    await assertMember(ctx, guest.workspaceId);
    return guest;
  },
});
