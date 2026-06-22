import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

/**
 * PUBLIC, UNAUTHENTICATED endpoints for the Wedding Website module (v1.6.0).
 *
 * ⚠️ SAFETY: This file is the entire public surface of Avow. It deliberately
 * does NOT import `assertMember` and must never call it — these functions are
 * reachable by anyone on the internet. Two rules, both correctness requirements:
 *
 *   1. WHITELIST, never blacklist. Every value returned here is assembled into
 *      an explicit object listing only the allowed fields. Never return a raw
 *      Convex document — a future field added to a table must default to hidden,
 *      not be accidentally exposed.
 *   2. The token is the auth for RSVP. A token resolves to exactly one guest and
 *      may only read/write that guest's own fields. Invalid tokens fail generic
 *      (no signal about whether a token "almost" matched).
 */

// ── Public site render ──────────────────────────────────────────────────────

/**
 * Resolve a published site by slug. Returns null for an unknown slug OR an
 * unpublished site (no way to reach draft content via the public route).
 * Returns only whitelisted content + a whitelisted schedule projection.
 */
export const getPublicSite = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const site = await ctx.db
      .query("weddingSites")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!site || !site.published) return null;

    // Public schedule: only items explicitly marked public, projected to a
    // whitelist of fields. vendorId / responsibleParty / notes never leave here.
    const items = await ctx.db
      .query("timelineItems")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", site.workspaceId))
      .take(500);
    const schedule = items
      .filter((i) => i.isPublic === true)
      .sort((a, b) => a.time - b.time)
      .map((i) => ({ time: i.time, title: i.title, location: i.location ?? null }));

    return {
      coupleNames: site.coupleNames ?? null,
      weddingDate: site.weddingDate ?? null,
      venueName: site.venueName ?? null,
      venueLocation: site.venueLocation ?? null,
      story: site.story ?? null,
      travelNotes: site.travelNotes ?? null,
      schedule,
    };
  },
});

// ── Token-gated RSVP ──────────────────────────────────────────────────────────

/**
 * Resolve an invite token to the single guest it belongs to, returning only
 * that guest's own RSVP-relevant fields plus minimal couple/site context.
 * Returns null for an unknown token (caller shows a clean error).
 */
export const getInvite = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const guest = await ctx.db
      .query("guests")
      .withIndex("by_rsvpToken", (q) => q.eq("rsvpToken", args.token))
      .unique();
    if (!guest) return null;

    const site = await ctx.db
      .query("weddingSites")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", guest.workspaceId))
      .unique();

    return {
      // The invited guest's own fields only.
      name: guest.name,
      hasPlusOne: guest.hasPlusOne ?? false,
      plusOneName: guest.plusOneName ?? null,
      dietaryNotes: guest.dietaryNotes ?? null,
      rsvpStatus: guest.rsvpStatus ?? "pending",
      // Minimal site context for the invite header.
      site: {
        coupleNames: site?.coupleNames ?? null,
        weddingDate: site?.weddingDate ?? null,
        venueName: site?.venueName ?? null,
      },
    };
  },
});

/**
 * Submit an RSVP via invite token. Updates ONLY the token's guest, and only the
 * fields a guest is allowed to set: rsvpStatus (yes/no), dietary notes, and the
 * plus-one name (only if the couple granted that guest a plus-one). Never
 * touches hasPlusOne, side, name, or any other guest.
 */
export const submitRsvp = mutation({
  args: {
    token: v.string(),
    rsvpStatus: v.union(v.literal("yes"), v.literal("no")),
    plusOneName: v.optional(v.string()),
    dietaryNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const guest = await ctx.db
      .query("guests")
      .withIndex("by_rsvpToken", (q) => q.eq("rsvpToken", args.token))
      .unique();
    // Generic failure — don't reveal whether a token nearly matched.
    if (!guest) throw new ConvexError("This invite link is not valid.");

    await ctx.db.patch(guest._id, {
      rsvpStatus: args.rsvpStatus,
      ...(args.dietaryNotes !== undefined
        ? { dietaryNotes: args.dietaryNotes.trim() || undefined }
        : {}),
      // Plus-one name only when the couple actually granted a plus-one.
      ...(guest.hasPlusOne && args.plusOneName !== undefined
        ? { plusOneName: args.plusOneName.trim() || undefined }
        : {}),
    });
    return null;
  },
});
