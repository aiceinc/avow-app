import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember } from "./lib";

/**
 * Day-of Timeline module (v1.5.0). A time-ordered run-of-show for the wedding
 * day. Mirrors the Vendors/Budget backend patterns. `time` is minutes from
 * midnight (0–1439); chronological ordering is done client-side (numeric sort
 * on time, stable secondary on creation order). Items optionally link to a
 * vendor via vendorId — detached gracefully when a vendor is deleted (see
 * vendors.removeVendor).
 */

/** Clamp a time to a valid minutes-from-midnight integer (0–1439). */
function clampTime(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1439, Math.max(0, Math.round(n)));
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All timeline items in a workspace. Sorted/filtered client-side. */
export const listItems = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("timelineItems")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

export const addItem = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    time: v.number(),
    title: v.string(),
    location: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    responsibleParty: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);

    const title = args.title.trim();
    if (!title) throw new Error("Event title is required");

    if (args.vendorId !== undefined) {
      const vendor = await ctx.db.get(args.vendorId);
      if (!vendor || vendor.workspaceId !== args.workspaceId) {
        throw new Error("Vendor not found in this workspace");
      }
    }

    return await ctx.db.insert("timelineItems", {
      workspaceId: args.workspaceId,
      time: clampTime(args.time),
      title,
      location: args.location?.trim() || undefined,
      vendorId: args.vendorId,
      responsibleParty: args.responsibleParty?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });
  },
});

/**
 * Update a timeline item. Partial — only provided fields change. Pass null for
 * vendorId to unlink.
 */
export const updateItem = mutation({
  args: {
    itemId: v.id("timelineItems"),
    time: v.optional(v.number()),
    title: v.optional(v.string()),
    location: v.optional(v.string()),
    vendorId: v.optional(v.union(v.id("vendors"), v.null())),
    responsibleParty: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Timeline item not found");
    await assertMember(ctx, item.workspaceId);

    if (args.title !== undefined && !args.title.trim()) {
      throw new Error("Event title cannot be empty");
    }
    if (args.vendorId !== undefined && args.vendorId !== null) {
      const vendor = await ctx.db.get(args.vendorId);
      if (!vendor || vendor.workspaceId !== item.workspaceId) {
        throw new Error("Vendor not found in this workspace");
      }
    }

    await ctx.db.patch(args.itemId, {
      ...(args.time !== undefined ? { time: clampTime(args.time) } : {}),
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(args.location !== undefined
        ? { location: args.location.trim() || undefined }
        : {}),
      ...(args.vendorId !== undefined
        ? { vendorId: args.vendorId === null ? undefined : args.vendorId }
        : {}),
      ...(args.responsibleParty !== undefined
        ? { responsibleParty: args.responsibleParty.trim() || undefined }
        : {}),
      ...(args.notes !== undefined ? { notes: args.notes.trim() || undefined } : {}),
    });
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("timelineItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Timeline item not found");
    await assertMember(ctx, item.workspaceId);
    await ctx.db.delete(args.itemId);
  },
});
