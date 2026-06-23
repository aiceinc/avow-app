import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertMember, assertTierFeature } from "./lib";

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return all tables in a workspace.
 */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("tables")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("asc")
      .take(200);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a single table to the canvas.
 */
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    shape: v.union(v.literal("round"), v.literal("rectangular")),
    seatCount: v.number(),
    x: v.number(),
    y: v.number(),
    rotation: v.number(),
    label: v.optional(v.string()),
    radius: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    kind: v.optional(v.union(v.literal("seating"), v.literal("object"))),
    objectKind: v.optional(v.string()),
    layoutId: v.optional(v.id("seatingLayouts")),
  },
  handler: async (ctx, args) => {
    await assertTierFeature(ctx, args.workspaceId, "seating");
    return await ctx.db.insert("tables", args);
  },
});

/**
 * Create multiple tables at once — used when applying a layout template.
 */
export const createBatch = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    layoutId: v.optional(v.id("seatingLayouts")),
    tables: v.array(
      v.object({
        shape: v.union(v.literal("round"), v.literal("rectangular")),
        seatCount: v.number(),
        x: v.number(),
        y: v.number(),
        rotation: v.number(),
        label: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await assertTierFeature(ctx, args.workspaceId, "seating");
    const ids: string[] = [];
    for (const table of args.tables) {
      const id = await ctx.db.insert("tables", {
        workspaceId: args.workspaceId,
        layoutId: args.layoutId,
        ...table,
      });
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Update a table's position, rotation, shape, seat count, or label.
 * Verifies the table belongs to a workspace the caller is a member of.
 */
export const update = mutation({
  args: {
    tableId: v.id("tables"),
    shape: v.optional(v.union(v.literal("round"), v.literal("rectangular"))),
    seatCount: v.optional(v.number()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    rotation: v.optional(v.number()),
    label: v.optional(v.string()),
    radius: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError("Table not found");
    await assertTierFeature(ctx, table.workspaceId, "seating");

    const { tableId, ...fields } = args;
    await ctx.db.patch(tableId, fields);
  },
});

/**
 * Delete a table and all its seat assignments.
 */
export const remove = mutation({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError("Table not found");
    await assertTierFeature(ctx, table.workspaceId, "seating");

    // Delete all seat assignments for this table first
    const assignments = await ctx.db
      .query("seatAssignments")
      .withIndex("by_tableId", (q) => q.eq("tableId", args.tableId))
      .take(500);

    for (const a of assignments) {
      await ctx.db.delete(a._id);
    }

    await ctx.db.delete(args.tableId);
  },
});

/**
 * Remove all tables and seat assignments — for a single layout when `layoutId`
 * is given (multi-layout "Start over"), or the whole workspace otherwise (legacy).
 * Called before applying a layout template.
 */
export const clearAll = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    layoutId: v.optional(v.id("seatingLayouts")),
  },
  handler: async (ctx, args) => {
    await assertTierFeature(ctx, args.workspaceId, "seating");

    const tables = args.layoutId
      ? await ctx.db
          .query("tables")
          .withIndex("by_layoutId", (q) => q.eq("layoutId", args.layoutId))
          .take(1000)
      : await ctx.db
          .query("tables")
          .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
          .take(1000);

    for (const t of tables) {
      const seats = await ctx.db
        .query("seatAssignments")
        .withIndex("by_tableId", (q) => q.eq("tableId", t._id))
        .take(500);
      for (const s of seats) await ctx.db.delete(s._id);
      await ctx.db.delete(t._id);
    }
  },
});
