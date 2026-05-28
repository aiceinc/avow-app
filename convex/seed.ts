import { mutation } from "./_generated/server";
import { v } from "convex/values";

const SEED_GUESTS = [
  { name: "Margaret Chen",     side: "Partner A" as const, dietaryNotes: "Vegetarian" },
  { name: "David Chen",        side: "Partner A" as const },
  { name: "Susan Park",        side: "Partner A" as const },
  { name: "James Park",        side: "Partner A" as const, dietaryNotes: "Nut allergy" },
  { name: "Olivia Torres",     side: "Partner A" as const },
  { name: "Rafael Torres",     side: "Partner A" as const },
  { name: "Clara Osei",        side: "Partner A" as const, dietaryNotes: "Vegan" },
  { name: "William Nakamura",  side: "Partner B" as const },
  { name: "Helen Nakamura",    side: "Partner B" as const },
  { name: "Thomas Reyes",      side: "Partner B" as const },
  { name: "Priya Sharma",      side: "Partner B" as const, dietaryNotes: "Gluten-free" },
  { name: "Marcus Johnson",    side: "Partner B" as const },
  { name: "Ingrid Larsen",     side: "Partner B" as const },
  { name: "Kwame Asante",      side: "Partner B" as const },
  { name: "Sophie Dubois",     side: "both" as const },
  { name: "Ethan Dubois",      side: "both" as const },
  { name: "Nadia Petrov",      side: "both" as const },
  { name: "Leo Andersen",      side: "both" as const, dietaryNotes: "Kosher" },
];

/**
 * Seed the database with pre-loaded guests.
 * Safe to call multiple times — it checks whether guests already exist
 * and does nothing if they do.
 */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if guests already exist
    const existing = await ctx.db.query("guests").take(1);
    if (existing.length > 0) {
      return { seeded: false, reason: "Guests already exist" };
    }

    // Insert all seed guests
    for (const guest of SEED_GUESTS) {
      await ctx.db.insert("guests", guest);
    }

    return { seeded: true, count: SEED_GUESTS.length };
  },
});
