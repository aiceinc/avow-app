import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertMember, assertCanEdit } from "./lib";

/**
 * Seating layouts (v1.18.0). A wedding can have multiple seating arrangements
 * (Dinner, Reception/ceremony, extra spaces). Each layout owns its own tables +
 * venue. Tables carry `layoutId`; seat assignments are implicitly per-layout
 * (via their table), so a guest can be seated once per layout.
 */

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    const layouts = await ctx.db
      .query("seatingLayouts")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50);
    return layouts.sort((a, b) => a.order - b.order);
  },
});

/**
 * Create the default layouts (Dinner + Reception) on first use, and adopt any
 * pre-multi-layout tables (no layoutId) into the first (Dinner) layout. Idempotent
 * — a no-op once layouts exist. Carries the workspace's legacy venue dims onto the
 * Dinner layout for a clean migration.
 */
export const ensure = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const existing = await ctx.db
      .query("seatingLayouts")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50);
    if (existing.length > 0) return;

    const ws = await ctx.db.get(args.workspaceId);
    const dinnerId = await ctx.db.insert("seatingLayouts", {
      workspaceId: args.workspaceId,
      name: "Dinner",
      order: 0,
      // Migrate the legacy workspace-level venue (v1.17.0) onto Dinner.
      venueWidthFt: ws?.venueWidthFt,
      venueLengthFt: ws?.venueHeightFt,
    });
    await ctx.db.insert("seatingLayouts", {
      workspaceId: args.workspaceId,
      name: "Reception",
      order: 1,
    });

    // Adopt orphan tables into Dinner.
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(1000);
    for (const t of tables) {
      if (!t.layoutId) await ctx.db.patch(t._id, { layoutId: dinnerId });
    }
  },
});

export const create = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const name = args.name.trim() || "New layout";
    const all = await ctx.db
      .query("seatingLayouts")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50);
    const maxOrder = all.reduce((m, l) => Math.max(m, l.order), -1);
    return await ctx.db.insert("seatingLayouts", {
      workspaceId: args.workspaceId,
      name,
      order: maxOrder + 1,
    });
  },
});

export const rename = mutation({
  args: { layoutId: v.id("seatingLayouts"), name: v.string() },
  handler: async (ctx, args) => {
    const layout = await ctx.db.get(args.layoutId);
    if (!layout) throw new ConvexError("Layout not found");
    await assertCanEdit(ctx, layout.workspaceId);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Layout name cannot be empty");
    await ctx.db.patch(args.layoutId, { name });
  },
});

export const remove = mutation({
  args: { layoutId: v.id("seatingLayouts") },
  handler: async (ctx, args) => {
    const layout = await ctx.db.get(args.layoutId);
    if (!layout) throw new ConvexError("Layout not found");
    await assertCanEdit(ctx, layout.workspaceId);
    const all = await ctx.db
      .query("seatingLayouts")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", layout.workspaceId))
      .take(50);
    if (all.length <= 1) {
      throw new ConvexError("A wedding needs at least one seating layout.");
    }
    // Delete this layout's tables and their seat assignments.
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_layoutId", (q) => q.eq("layoutId", args.layoutId))
      .take(1000);
    for (const t of tables) {
      const seats = await ctx.db
        .query("seatAssignments")
        .withIndex("by_tableId", (q) => q.eq("tableId", t._id))
        .take(500);
      for (const s of seats) await ctx.db.delete(s._id);
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(args.layoutId);
  },
});

/** Set (or clear, with null) the venue floor-plan for a layout, in feet. */
export const setVenue = mutation({
  args: {
    layoutId: v.id("seatingLayouts"),
    widthFt: v.union(v.number(), v.null()),
    lengthFt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const layout = await ctx.db.get(args.layoutId);
    if (!layout) throw new ConvexError("Layout not found");
    await assertCanEdit(ctx, layout.workspaceId);
    await ctx.db.patch(args.layoutId, {
      venueWidthFt:
        args.widthFt === null ? undefined : Math.min(500, Math.max(5, Math.round(args.widthFt))),
      venueLengthFt:
        args.lengthFt === null ? undefined : Math.min(500, Math.max(5, Math.round(args.lengthFt))),
    });
  },
});
