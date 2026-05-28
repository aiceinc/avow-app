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
