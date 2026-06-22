import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertMember, assertCanEdit } from "./lib";

/**
 * Tasks (v1.10.1) — a simple workspace-scoped checklist shown on the home
 * dashboard. Membership-gated like every other authed module.
 */

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("tasks")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("asc")
      .take(200);
  },
});

export const add = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const title = args.title.trim();
    if (!title) throw new ConvexError("Task title is required");
    return await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      title,
      done: false,
      dueDate: args.dueDate?.trim() || undefined,
    });
  },
});

/** Flip a task's done state. */
export const toggle = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Task not found");
    await assertCanEdit(ctx, task.workspaceId);
    await ctx.db.patch(args.taskId, { done: !task.done });
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Task not found");
    await assertCanEdit(ctx, task.workspaceId);
    await ctx.db.delete(args.taskId);
  },
});
