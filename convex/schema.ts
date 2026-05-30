import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Avow seating planner — Convex schema (Phase 2)
 *
 * Auth tables (from @convex-dev/auth):
 *  - users, sessions, accounts, verificationCodes, authRateLimits
 *
 * App tables:
 *  - workspaces:       one workspace = one wedding being planned
 *  - workspaceMembers: which users are members of which workspace (1–2 per workspace)
 *  - guests:           pre-seeded guest list, now scoped to a workspace
 *  - tables:           venue tables on the canvas, scoped to a workspace
 *  - seatAssignments:  which guest sits where, scoped to a workspace
 *  - cursors:          ephemeral live cursor presence, scoped to a workspace
 */
export default defineSchema({
  // ── Convex Auth tables (managed by @convex-dev/auth) ─────────────────────
  ...authTables,

  // ── workspaces ────────────────────────────────────────────────────────────
  workspaces: defineTable({
    name: v.string(),
    // Shareable invite token — generated on demand, expires after 48h
    inviteCode: v.optional(v.string()),
    inviteCodeExpiry: v.optional(v.number()), // Date.now() + 48h
    // Retention trigger (v1.9.0). Set when the workspace's subscription lapses;
    // the retention cron purges the workspace RETENTION_GRACE_DAYS later (see
    // convex/retention.ts). Unset/undefined = active → NEVER purged. No billing
    // system sets this yet, so it is unset on every workspace today and the
    // retention job purges nothing in normal operation.
    subscriptionLapsedAt: v.optional(v.number()),
  }),

  // ── workspaceMembers ──────────────────────────────────────────────────────
  // Join table: which users belong to which workspace.
  // Max 2 members per workspace (enforced in mutation layer).
  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"), // from authTables
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_userId", ["userId"])
    .index("by_workspaceId_and_userId", ["workspaceId", "userId"]),

  // ── guests ────────────────────────────────────────────────────────────────
  guests: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    side: v.union(
      v.literal("Partner A"),
      v.literal("Partner B"),
      v.literal("both")
    ),
    dietaryNotes: v.optional(v.string()),
    // Guest List module fields (added v1.2.0). All optional for backward
    // compatibility — pre-existing guests render as "pending" / no plus-one.
    rsvpStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("yes"),
        v.literal("no"),
        v.literal("maybe")
      )
    ),
    hasPlusOne: v.optional(v.boolean()),
    plusOneName: v.optional(v.string()),
    // Wedding Website module (v1.6.0): per-guest opaque RSVP token. Generated on
    // demand when the couple shares an invite link. The token is the auth for
    // the public token-gated RSVP write-back — see convex/public.ts.
    rsvpToken: v.optional(v.string()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_rsvpToken", ["rsvpToken"]),

  // ── tables ────────────────────────────────────────────────────────────────
  tables: defineTable({
    workspaceId: v.id("workspaces"),
    shape: v.union(v.literal("round"), v.literal("rectangular")),
    seatCount: v.number(),
    x: v.number(),
    y: v.number(),
    rotation: v.number(),
    label: v.optional(v.string()),
    // Optional per-table dimensions (set when a table is resized).
    // When absent, the canvas falls back to the default constants in geometry.ts.
    radius: v.optional(v.number()), // round tables
    width: v.optional(v.number()),  // rectangular tables
    height: v.optional(v.number()), // rectangular tables
  }).index("by_workspaceId", ["workspaceId"]),

  // ── seatAssignments ───────────────────────────────────────────────────────
  seatAssignments: defineTable({
    workspaceId: v.id("workspaces"),
    tableId: v.id("tables"),
    seatIndex: v.number(),
    guestId: v.id("guests"),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_tableId", ["tableId"])
    .index("by_guestId", ["guestId"])
    .index("by_tableId_and_seatIndex", ["tableId", "seatIndex"]),

  // ── Budget Tracker (v1.3.0) ───────────────────────────────────────────────
  // Per-workspace budget settings. One row per workspace; targetBudget is
  // absent until the couple sets it.
  budgetSettings: defineTable({
    workspaceId: v.id("workspaces"),
    targetBudget: v.optional(v.number()), // whole dollars; absent = unset
  }).index("by_workspaceId", ["workspaceId"]),

  // Spending categories. Seeded with 11 defaults on first Budget visit; users
  // can rename/delete/add regardless of isDefault.
  budgetCategories: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    order: v.number(),     // display order
    isDefault: v.boolean(), // true for seeded categories
  }).index("by_workspaceId", ["workspaceId"]),

  // Individual budget line items, grouped by category.
  budgetLineItems: defineTable({
    workspaceId: v.id("workspaces"),
    categoryId: v.id("budgetCategories"),
    name: v.string(),
    estimatedCost: v.number(),            // whole dollars
    actualCost: v.optional(v.number()),   // absent = not yet known
    paidStatus: v.union(
      v.literal("unpaid"),
      v.literal("paid"),
      v.literal("partial")
    ),
    amountPaid: v.optional(v.number()),   // only relevant when paidStatus === "partial"
    notes: v.optional(v.string()),
    // FK to a vendor record (Vendors module, v1.4.0). Optional + additive.
    vendorId: v.optional(v.id("vendors")),
    // Legacy free-text vendor (pre-v1.4.0). Retained for backward compatibility
    // and lazy migration: when a user picks a real vendor in the editor we set
    // vendorId and clear this. Display prefers vendorId, falls back to this.
    // Also used as a graceful fallback when a referenced vendor is deleted
    // (its name is preserved here). Do NOT drop — old rows still rely on it.
    vendor: v.optional(v.string()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_categoryId", ["categoryId"])
    .index("by_vendorId", ["vendorId"]),

  // ── Vendors (v1.4.0) ──────────────────────────────────────────────────────
  // Vendor "type" categories (Photographer, Caterer, …) — distinct from budget
  // spending categories. Seeded with defaults on first Vendors visit; users can
  // rename/delete/add regardless of isDefault. Mirrors budgetCategories.
  vendorCategories: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    order: v.number(),      // display order
    isDefault: v.boolean(), // true for seeded categories
  }).index("by_workspaceId", ["workspaceId"]),

  // Vendor records. Cost lives in the budget (a budgetLineItem points here via
  // vendorId) — vendors intentionally store no cost, to keep a single source of
  // truth. categoryId is optional ("Uncategorized" allowed).
  vendors: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    categoryId: v.optional(v.id("vendorCategories")),
    status: v.union(
      v.literal("researching"),
      v.literal("contacted"),
      v.literal("booked"),
      v.literal("declined")
    ),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_categoryId", ["categoryId"]),

  // ── Day-of Timeline (v1.5.0) ──────────────────────────────────────────────
  // A time-ordered run-of-show for the wedding day. Single-day, time-of-day
  // centric: `time` is minutes-from-midnight (0–1439), so chronological sort is
  // a plain numeric sort and there's no date/timezone to model. vendorId is an
  // optional FK reusing the Vendors module; responsibleParty stays free text
  // (no separate people/roles table in v1).
  timelineItems: defineTable({
    workspaceId: v.id("workspaces"),
    time: v.number(),                 // minutes from midnight (0–1439)
    title: v.string(),
    location: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    responsibleParty: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Wedding Website module (v1.6.0): when true, this item is shown on the
    // public site. Absent/false = private. Only a whitelisted projection
    // (time/title/location) is ever exposed publicly — see convex/public.ts.
    isPublic: v.optional(v.boolean()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_vendorId", ["vendorId"]),

  // ── Wedding Website (v1.6.0) ──────────────────────────────────────────────
  // One published mini-site per workspace, served publicly at /w/{slug}. `slug`
  // is globally unique (the public URL is global). The site is unpublished until
  // the couple explicitly publishes; the public route only ever renders rows
  // with published === true (see convex/public.ts). Content fields are a small
  // fixed set — no CMS.
  weddingSites: defineTable({
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    published: v.boolean(),
    coupleNames: v.optional(v.string()),
    weddingDate: v.optional(v.string()),    // ISO "YYYY-MM-DD"
    venueName: v.optional(v.string()),
    venueLocation: v.optional(v.string()),
    story: v.optional(v.string()),
    travelNotes: v.optional(v.string()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_slug", ["slug"]),

  // ── cursors ───────────────────────────────────────────────────────────────
  // High-churn ephemeral presence. One row per active user per workspace.
  cursors: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),   // real user ID once auth is wired; kept string for flexibility
    label: v.string(),
    x: v.number(),
    y: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_workspaceId_and_userId", ["workspaceId", "userId"]),
});
