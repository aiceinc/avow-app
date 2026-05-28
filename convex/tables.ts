import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return all tables on the canvas.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tables").order("asc").take(200);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a single table to the canvas.
 */
export const create = mutation({
  args: {
    shape: v.union(v.literal("round"), v.literal("rectangular")),
    seatCount: v.number(),
    x: v.number(),
    y: v.number(),
    rotation: v.number(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tables", args);
  },
});

/**
 * Create multiple tables at once — used when applying a layout template.
 */
export const createBatch = mutation({
  args: {
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
    const ids: string[] = [];
    for (const table of args.tables) {
      const id = await ctx.db.insert("tables", table);
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Update a table's position, rotation, shape, seat count, or label.
 * Only the fields provided are changed (shallow patch).
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
  },
  handler: async (ctx, args) => {
    const { tableId, ...fields } = args;
    await ctx.db.patch(tableId, fields);
  },
});

/**
 * Delete a table and all its seat assignments.
 * Must remove assignments first — they hold foreign keys to the table.
 */
export const remove = mutation({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    // Delete all seat assignments for this table
    const assignments = await ctx.db
      .query("seatAssignments")
      .withIndex("by_tableId", (q) => q.eq("tableId", args.tableId))
      .take(500);

    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
    }

    // Delete the table itself
    await ctx.db.delete(args.tableId);
  },
});

/**
 * Remove all tables and all seat assignments from the canvas.
 * Called before applying a layout template.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    // Delete all seat assignments first
    const assignments = await ctx.db
      .query("seatAssignments")
      .take(500);
    for (const a of assignments) {
      await ctx.db.delete(a._id);
    }

    // Delete all tables
    const tables = await ctx.db.query("tables").take(500);
    for (const t of tables) {
      await ctx.db.delete(t._id);
    }
  },
});
