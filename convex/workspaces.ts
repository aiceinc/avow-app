import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAuth, assertMember } from "./lib";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns the current authenticated user's ID and email.
 * Used by client components that need the user identity without a separate
 * users table query.
 */
export const getMyUserId = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return {
      userId: userId as string,
      email:  user?.email ?? null,
      name:   user?.name ?? null,
    };
  },
});

/**
 * List all workspaces the current user is a member of,
 * along with the other members of each workspace.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Find all workspaceMembers rows for this user
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(20);

    // Load each workspace + its members
    const result = [];
    for (const m of memberships) {
      const workspace = await ctx.db.get(m.workspaceId);
      if (!workspace) continue;

      const members = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", m.workspaceId))
        .take(5);

      // Load member user records for display
      const memberUsers = await Promise.all(
        members.map(async (mem) => {
          const user = await ctx.db.get(mem.userId);
          return { userId: mem.userId, email: user?.email ?? null, name: user?.name ?? null };
        })
      );

      result.push({ ...workspace, members: memberUsers });
    }

    return result;
  },
});

/**
 * Get a single workspace (for the active session). Enforces membership.
 */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db.get(args.workspaceId);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Create a new workspace and make the current user its first member.
 * Seeds the workspace with 18 fake guests automatically.
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Create the workspace
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name.trim(),
    });

    // Add the creator as a member
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
    });

    // Seed guests for this workspace
    await seedGuests(ctx, workspaceId);

    return workspaceId;
  },
});

/**
 * Generate a shareable invite link token for a workspace.
 * Only existing members can generate invites.
 * Only workspaces with fewer than 2 members can invite.
 */
export const generateInvite = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);

    // Check current member count
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(5);

    if (members.length >= 2) {
      throw new Error("Workspace already has 2 members");
    }

    // Generate a random invite code
    const code = Array.from(
      { length: 8 },
      () => Math.random().toString(36)[2]
    ).join('');

    await ctx.db.patch(args.workspaceId, {
      inviteCode: code,
      inviteCodeExpiry: Date.now() + INVITE_TTL_MS,
    });

    return code;
  },
});

/**
 * Join a workspace via an invite code.
 * The user must be authenticated. The code must be valid and not expired.
 */
export const joinByInviteCode = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Find the workspace with this invite code
    // We scan all workspaces — acceptable at prototype scale (at most a handful)
    const workspaces = await ctx.db.query("workspaces").take(200);
    const workspace = workspaces.find(
      (w) =>
        w.inviteCode === args.inviteCode.trim() &&
        w.inviteCodeExpiry !== undefined &&
        w.inviteCodeExpiry > Date.now()
    );

    if (!workspace) {
      throw new Error("Invalid or expired invite code");
    }

    // Check member count
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .take(5);

    if (members.length >= 2) {
      throw new Error("Workspace is full");
    }

    // Check if already a member
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", userId)
      )
      .unique();

    if (existing) {
      return workspace._id; // already in — just return the workspace ID
    }

    // Add as member
    await ctx.db.insert("workspaceMembers", {
      workspaceId: workspace._id,
      userId,
    });

    // Invalidate the invite code after use
    await ctx.db.patch(workspace._id, {
      inviteCode: undefined,
      inviteCodeExpiry: undefined,
    });

    return workspace._id;
  },
});

// ── Internal helpers ──────────────────────────────────────────────────────────

const SEED_GUESTS = [
  { name: "Margaret Chen",    side: "Partner A" as const, dietaryNotes: "Vegetarian" },
  { name: "David Chen",       side: "Partner A" as const },
  { name: "Susan Park",       side: "Partner A" as const },
  { name: "James Park",       side: "Partner A" as const, dietaryNotes: "Nut allergy" },
  { name: "Olivia Torres",    side: "Partner A" as const },
  { name: "Rafael Torres",    side: "Partner A" as const },
  { name: "Clara Osei",       side: "Partner A" as const, dietaryNotes: "Vegan" },
  { name: "William Nakamura", side: "Partner B" as const },
  { name: "Helen Nakamura",   side: "Partner B" as const },
  { name: "Thomas Reyes",     side: "Partner B" as const },
  { name: "Priya Sharma",     side: "Partner B" as const, dietaryNotes: "Gluten-free" },
  { name: "Marcus Johnson",   side: "Partner B" as const },
  { name: "Ingrid Larsen",    side: "Partner B" as const },
  { name: "Kwame Asante",     side: "Partner B" as const },
  { name: "Sophie Dubois",    side: "both" as const },
  { name: "Ethan Dubois",     side: "both" as const },
  { name: "Nadia Petrov",     side: "both" as const },
  { name: "Leo Andersen",     side: "both" as const, dietaryNotes: "Kosher" },
];

/**
 * Insert the 18 seed guests for a newly created workspace.
 * Called internally — not exposed as a public mutation.
 */
async function seedGuests(
  ctx: import("./_generated/server").MutationCtx,
  workspaceId: import("./_generated/dataModel").Id<"workspaces">
) {
  for (const guest of SEED_GUESTS) {
    await ctx.db.insert("guests", { workspaceId, ...guest });
  }
}
