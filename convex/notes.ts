import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertMember, assertCanEdit } from "./lib";

/**
 * Notes (v1.10.1) — free-text "notebook" entries shown on the home dashboard,
 * newest first. Membership-gated. The entry date is the row's _creationTime.
 */

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("notes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(200);
  },
});

export const add = mutation({
  args: { workspaceId: v.id("workspaces"), text: v.string() },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const text = args.text.trim();
    if (!text) throw new ConvexError("Note text is required");
    return await ctx.db.insert("notes", { workspaceId: args.workspaceId, text });
  },
});

export const remove = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError("Note not found");
    await assertCanEdit(ctx, note.workspaceId);
    await ctx.db.delete(args.noteId);
  },
});
