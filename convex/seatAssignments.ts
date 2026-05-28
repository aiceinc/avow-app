import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return all seat assignments. The frontend uses this to render
 * which guests are at which seats and to show assigned/unassigned
 * state in the guest side panel.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("seatAssignments").take(500);
  },
});

/**
 * Return all assignments for a single table.
 */
export const listForTable = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("seatAssignments")
      .withIndex("by_tableId", (q) => q.eq("tableId", args.tableId))
      .take(200);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Assign a guest to a specific seat.
 *
 * Invariants enforced (both atomically in one transaction):
 *  1. A seat can only hold one guest — if the target seat is already occupied,
 *     that existing assignment is removed first.
 *  2. A guest can only sit in one seat — if the guest is already seated
 *     elsewhere, that assignment is removed before the new one is created.
 */
export const assign = mutation({
  args: {
    tableId: v.id("tables"),
    seatIndex: v.number(),
    guestId: v.id("guests"),
  },
  handler: async (ctx, args) => {
    // 1. Evict whoever is already in the target seat (if anyone)
    const seatOccupant = await ctx.db
      .query("seatAssignments")
      .withIndex("by_tableId_and_seatIndex", (q) =>
        q.eq("tableId", args.tableId).eq("seatIndex", args.seatIndex)
      )
      .unique();

    if (seatOccupant !== null) {
      await ctx.db.delete(seatOccupant._id);
    }

    // 2. Remove any existing assignment for this guest (they can only sit once)
    const guestExisting = await ctx.db
      .query("seatAssignments")
      .withIndex("by_guestId", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (guestExisting !== null) {
      await ctx.db.delete(guestExisting._id);
    }

    // 3. Create the new assignment
    return await ctx.db.insert("seatAssignments", {
      tableId: args.tableId,
      seatIndex: args.seatIndex,
      guestId: args.guestId,
    });
  },
});

/**
 * Unassign a guest — removes them from their current seat and
 * returns them to the unassigned list in the side panel.
 * No-op if the guest has no assignment.
 */
export const unassign = mutation({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db
      .query("seatAssignments")
      .withIndex("by_guestId", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (assignment !== null) {
      await ctx.db.delete(assignment._id);
    }
  },
});
