import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember, assertCanEdit, assertGuestCapacity } from "./lib";

// ── Shared validators ───────────────────────────────────────────────────────
const sideValidator = v.union(
  v.literal("Partner A"),
  v.literal("Partner B"),
  v.literal("both")
);

const rsvpValidator = v.union(
  v.literal("pending"),
  v.literal("yes"),
  v.literal("no"),
  v.literal("maybe")
);

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return all guests in a workspace.
 * Enforces that the calling user is a member of the workspace.
 *
 * Sorting and RSVP/side filtering are handled client-side (the list is bounded
 * and small), so this stays a simple indexed read.
 */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("guests")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("asc")
      .take(200);
  },
});

/**
 * Return a single guest by ID.
 * Verifies the guest belongs to a workspace the caller is a member of.
 */
export const get = query({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return null;
    await assertMember(ctx, guest.workspaceId);
    return guest;
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a guest to a workspace's guest list.
 * Real guests created here are the source of truth across the app (the seating
 * planner reads the same `guests` table).
 */
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    side: sideValidator,
    rsvpStatus: v.optional(rsvpValidator),
    dietaryNotes: v.optional(v.string()),
    hasPlusOne: v.optional(v.boolean()),
    plusOneName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    await assertGuestCapacity(ctx, args.workspaceId);

    const name = args.name.trim();
    if (!name) throw new Error("Guest name is required");

    const hasPlusOne = args.hasPlusOne ?? false;

    return await ctx.db.insert("guests", {
      workspaceId: args.workspaceId,
      name,
      side: args.side,
      rsvpStatus: args.rsvpStatus ?? "pending",
      dietaryNotes: args.dietaryNotes?.trim() || undefined,
      hasPlusOne,
      // Only keep a plus-one name when the guest actually has a plus-one.
      plusOneName: hasPlusOne ? args.plusOneName?.trim() || undefined : undefined,
    });
  },
});

/**
 * Update a guest. Partial — only the fields provided are changed.
 * Setting a field's value to `undefined` (e.g. clearing dietary notes) removes
 * it from the document.
 */
export const update = mutation({
  args: {
    guestId: v.id("guests"),
    name: v.optional(v.string()),
    side: v.optional(sideValidator),
    rsvpStatus: v.optional(rsvpValidator),
    dietaryNotes: v.optional(v.string()),
    hasPlusOne: v.optional(v.boolean()),
    plusOneName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new Error("Guest not found");
    await assertCanEdit(ctx, guest.workspaceId);

    if (args.name !== undefined && !args.name.trim()) {
      throw new Error("Guest name cannot be empty");
    }

    await ctx.db.patch(args.guestId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.side !== undefined ? { side: args.side } : {}),
      ...(args.rsvpStatus !== undefined ? { rsvpStatus: args.rsvpStatus } : {}),
      ...(args.dietaryNotes !== undefined
        ? { dietaryNotes: args.dietaryNotes.trim() || undefined }
        : {}),
      ...(args.hasPlusOne !== undefined
        ? {
            hasPlusOne: args.hasPlusOne,
            // Turning a plus-one off clears any stored name.
            ...(args.hasPlusOne ? {} : { plusOneName: undefined }),
          }
        : {}),
      ...(args.plusOneName !== undefined
        ? { plusOneName: args.plusOneName.trim() || undefined }
        : {}),
    });
  },
});

/**
 * Delete a guest and any seat assignment they currently hold.
 * The unassign + delete happen in the same mutation (atomic), so a deleted
 * guest can never leave a phantom seat in the seating planner.
 */
export const remove = mutation({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new Error("Guest not found");
    await assertCanEdit(ctx, guest.workspaceId);

    // Remove the guest's seat assignment first, if any.
    const assignment = await ctx.db
      .query("seatAssignments")
      .withIndex("by_guestId", (q) => q.eq("guestId", args.guestId))
      .unique();
    if (assignment !== null) {
      await ctx.db.delete(assignment._id);
    }

    await ctx.db.delete(args.guestId);
  },
});
