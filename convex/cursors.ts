import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember } from "./lib";

/**
 * cursors.ts — ephemeral presence / live cursor broadcasting
 *
 * Workspace-scoped: one row per active user per workspace.
 *
 * The acting user is ALWAYS derived server-side from the authenticated session
 * (never accepted as an argument). Taking a `userId` from the client would let
 * one member broadcast — or delete — presence under another member's identity,
 * and it violates the Convex guideline against using a client-supplied
 * identifier for authorization.
 */

// ── list ─────────────────────────────────────────────────────────────────────

/** Returns all cursor rows for a workspace. */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("cursors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(20);
  },
});

// ── upsert ────────────────────────────────────────────────────────────────────

/** Called at ~10 Hz per active user. Upserts the cursor row. */
export const upsert = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    label:       v.string(),
    x:           v.number(),
    y:           v.number(),
    updatedAt:   v.number(),
  },
  handler: async (ctx, args) => {
    // assertMember returns the authenticated user — the identity we key on.
    const userId = await assertMember(ctx, args.workspaceId);

    const existing = await ctx.db
      .query("cursors")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        x:         args.x,
        y:         args.y,
        updatedAt: args.updatedAt,
        label:     args.label,
      });
    } else {
      await ctx.db.insert("cursors", {
        workspaceId: args.workspaceId,
        userId,
        label:       args.label,
        x:           args.x,
        y:           args.y,
        updatedAt:   args.updatedAt,
      });
    }
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

/** Called on unmount to clean up this user's own cursor row. */
export const remove = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Best-effort: this fires on unmount, which can happen just after sign-out,
    // so a missing identity is not an error — we simply have nothing to clean up.
    // Deriving the user here (rather than accepting one) also means a caller can
    // only ever delete their OWN presence row.
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const existing = await ctx.db
      .query("cursors")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
