import { mutation, query, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { assertMember, assertCanEdit } from "./lib";

/**
 * Wedding Website module (v1.6.0) — AUTHENTICATED editor functions.
 *
 * Every function here calls assertMember (reads/bootstrap) or assertCanEdit
 * (content changes — gated by the trial/subscription paywall, v1.11.1). The
 * couple edits their site through these. The PUBLIC, unauthenticated render +
 * RSVP write-back live in a separate file (convex/public.ts) that deliberately
 * never imports assertMember — keeping the public surface auditable at a glance.
 */

// ── Slug helpers ──────────────────────────────────────────────────────────────

/** Slugify a name: lowercase, non-alphanumeric → "-", collapsed and trimmed. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** True if `slug` is already used by a DIFFERENT workspace's site. */
async function slugTaken(
  ctx: MutationCtx,
  slug: string,
  exclude: Id<"workspaces">
): Promise<boolean> {
  const existing = await ctx.db
    .query("weddingSites")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  return existing !== null && existing.workspaceId !== exclude;
}

/** Get the workspace's site row, creating it (with a unique slug) if absent. */
async function ensureSiteRow(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const existing = await ctx.db
    .query("weddingSites")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  if (existing) return existing;

  const ws = await ctx.db.get(workspaceId);
  const base = slugify(ws?.name ?? "") || "our-wedding";
  let slug = base;
  let n = 2;
  while (await slugTaken(ctx, slug, workspaceId)) {
    slug = `${base}-${n++}`;
  }
  const id = await ctx.db.insert("weddingSites", {
    workspaceId,
    slug,
    published: false,
  });
  return (await ctx.db.get(id))!;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** The workspace's wedding-site row (for the editor). Null until created. */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("weddingSites")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Create the site row on first visit (idempotent), with an auto-generated unique slug.
 *  Membership-gated bootstrap (not assertCanEdit) so a read-only workspace can
 *  still open the editor to view existing content. */
export const initSite = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    await ensureSiteRow(ctx, args.workspaceId);
  },
});

/** Update the fixed set of content fields. Partial — only provided fields change. */
export const updateContent = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    coupleNames: v.optional(v.string()),
    weddingDate: v.optional(v.string()),
    venueName: v.optional(v.string()),
    venueLocation: v.optional(v.string()),
    story: v.optional(v.string()),
    travelNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const site = await ensureSiteRow(ctx, args.workspaceId);
    await ctx.db.patch(site._id, {
      ...(args.coupleNames !== undefined ? { coupleNames: args.coupleNames.trim() || undefined } : {}),
      ...(args.weddingDate !== undefined ? { weddingDate: args.weddingDate.trim() || undefined } : {}),
      ...(args.venueName !== undefined ? { venueName: args.venueName.trim() || undefined } : {}),
      ...(args.venueLocation !== undefined ? { venueLocation: args.venueLocation.trim() || undefined } : {}),
      ...(args.story !== undefined ? { story: args.story.trim() || undefined } : {}),
      ...(args.travelNotes !== undefined ? { travelNotes: args.travelNotes.trim() || undefined } : {}),
    });
  },
});

/** Set the public slug. Validates format + global uniqueness. */
export const setSlug = mutation({
  args: { workspaceId: v.id("workspaces"), slug: v.string() },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const clean = slugify(args.slug);
    if (!clean) throw new ConvexError("Enter a valid web address (letters and numbers).");

    const site = await ensureSiteRow(ctx, args.workspaceId);
    if (await slugTaken(ctx, clean, args.workspaceId)) {
      throw new ConvexError("That web address is already taken — try another.");
    }
    await ctx.db.patch(site._id, { slug: clean });
    return clean;
  },
});

/** Publish or unpublish the site. */
export const setPublished = mutation({
  args: { workspaceId: v.id("workspaces"), published: v.boolean() },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const site = await ensureSiteRow(ctx, args.workspaceId);
    await ctx.db.patch(site._id, { published: args.published });
  },
});

/**
 * Ensure a guest has an opaque RSVP token, generating one if missing. Returns
 * the token so the editor can build the /w/{slug}/rsvp/{token} invite link.
 * Membership-gated (not assertCanEdit): minting a share token for existing
 * guests is a read-side convenience, not content editing.
 */
export const ensureGuestToken = mutation({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new ConvexError("Guest not found");
    await assertMember(ctx, guest.workspaceId);

    if (guest.rsvpToken) return guest.rsvpToken;
    const token = crypto.randomUUID().replace(/-/g, "");
    await ctx.db.patch(args.guestId, { rsvpToken: token });
    return token;
  },
});
