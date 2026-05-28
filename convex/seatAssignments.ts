import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember } from "./lib";

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return all seat assignments in a workspace.
 */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("seatAssignments")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
  },
});

/**
 * Return all assignments for a single table.
 */
export const listForTable = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) return [];
    await assertMember(ctx, table.workspaceId);
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
 * Invariants enforced atomically:
 *  1. A seat can only hold one guest — existing occupant is evicted.
 *  2. A guest can only sit in one seat — existing assignment is removed.
 *  3. Both the table and guest must belong to the same workspace.
 */
export const assign = mutation({
  args: {
    tableId: v.id("tables"),
    seatIndex: v.number(),
    guestId: v.id("guests"),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new Error("Guest not found");

    if (table.workspaceId !== guest.workspaceId) {
      throw new Error("Table and guest are in different workspaces");
    }

    await assertMember(ctx, table.workspaceId);

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

    // 2. Remove any existing assignment for this guest
    const guestExisting = await ctx.db
      .query("seatAssignments")
      .withIndex("by_guestId", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (guestExisting !== null) {
      await ctx.db.delete(guestExisting._id);
    }

    // 3. Create the new assignment
    return await ctx.db.insert("seatAssignments", {
      workspaceId: table.workspaceId,
      tableId: args.tableId,
      seatIndex: args.seatIndex,
      guestId: args.guestId,
    });
  },
});

/**
 * Unassign a guest from their current seat.
 */
export const unassign = mutation({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return;
    await assertMember(ctx, guest.workspaceId);

    const assignment = await ctx.db
      .query("seatAssignments")
      .withIndex("by_guestId", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (assignment !== null) {
      await ctx.db.delete(assignment._id);
    }
  },
});
