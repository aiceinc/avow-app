import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Avow seating planner — Convex schema
 *
 * Three tables:
 *  - guests:          the pre-seeded guest list (read-only in Phase 1)
 *  - tables:          venue tables placed on the canvas
 *  - seatAssignments: which guest sits in which seat of which table
 */
export default defineSchema({
  // ── guests ──────────────────────────────────────────────────────────────
  guests: defineTable({
    name: v.string(),
    // which side of the couple this guest belongs to
    side: v.union(
      v.literal("Partner A"),
      v.literal("Partner B"),
      v.literal("both")
    ),
    dietaryNotes: v.optional(v.string()),
  }),

  // ── tables ───────────────────────────────────────────────────────────────
  tables: defineTable({
    shape: v.union(v.literal("round"), v.literal("rectangular")),
    seatCount: v.number(),
    // canvas position and orientation
    x: v.number(),
    y: v.number(),
    rotation: v.number(), // degrees
    label: v.optional(v.string()),
  }),

  // ── seatAssignments ───────────────────────────────────────────────────────
  // One row per occupied seat. A guest can occupy at most one seat;
  // a seat can hold at most one guest — enforced in the mutation layer.
  seatAssignments: defineTable({
    tableId: v.id("tables"),
    seatIndex: v.number(), // 0-based index around the table edge
    guestId: v.id("guests"),
  })
    // look up all assignments for a given table (for rendering)
    .index("by_tableId", ["tableId"])
    // look up where a specific guest is sitting (for uniqueness checks)
    .index("by_guestId", ["guestId"])
    // check whether a specific seat is already taken
    .index("by_tableId_and_seatIndex", ["tableId", "seatIndex"]),
});
