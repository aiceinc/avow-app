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
  }).index("by_workspaceId", ["workspaceId"]),

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
    // TODO: when the Vendors module ships, this becomes v.id("vendors").
    // Kept as free text for now (see budget brief Part 4).
    vendor: v.optional(v.string()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_categoryId", ["categoryId"]),

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
