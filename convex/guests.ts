import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Return all guests. Capped at 200 — well above any real wedding guest list
 * for Phase 1 and avoids returning an unbounded result set.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("guests").order("asc").take(200);
  },
});

/**
 * Return a single guest by ID.
 */
export const get = query({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.guestId);
  },
});
