import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember, assertCanEdit } from "./lib";

// ── Shared validators / helpers ─────────────────────────────────────────────

const paidStatusValidator = v.union(
  v.literal("unpaid"),
  v.literal("paid"),
  v.literal("partial")
);

/** Amounts are stored as whole dollars. */
function dollars(n: number): number {
  return Math.max(0, Math.round(n));
}

const DEFAULT_CATEGORIES = [
  "Venue",
  "Catering & Bar",
  "Photography & Video",
  "Attire & Beauty",
  "Flowers & Decor",
  "Music & Entertainment",
  "Stationery",
  "Rings",
  "Transportation",
  "Gifts & Favors",
  "Miscellaneous",
];

// ── Queries ───────────────────────────────────────────────────────────────────

/** Budget settings for a workspace (target budget). Null until anything is set. */
export const getSettings = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("budgetSettings")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();
  },
});

/** All categories in a workspace, in display order. */
export const listCategories = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    const cats = await ctx.db
      .query("budgetCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    return cats.sort((a, b) => a.order - b.order);
  },
});

/** All line items in a workspace. Totals/subtotals are computed client-side. */
export const listLineItems = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("budgetLineItems")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
  },
});

// ── Seeding ─────────────────────────────────────────────────────────────────

/**
 * Seed the 11 default categories for a workspace. Idempotent: if the workspace
 * already has any categories, this is a no-op (re-checked here so concurrent
 * first-visits can't double-seed).
 *
 * Membership-gated (not assertCanEdit): this is idempotent bootstrap fired on
 * first view of the Budget module, so a read-only (lapsed) workspace can still
 * open the page without erroring — it just won't re-seed.
 */
export const seedDefaultCategories = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);

    const existing = await ctx.db
      .query("budgetCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(1);
    if (existing.length > 0) return; // already seeded

    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      await ctx.db.insert("budgetCategories", {
        workspaceId: args.workspaceId,
        name: DEFAULT_CATEGORIES[i],
        order: i,
        isDefault: true,
      });
    }
  },
});

// ── Target budget ─────────────────────────────────────────────────────────────

/**
 * Set or clear the workspace's target budget. Pass null to unset it.
 * Upserts the single budgetSettings row.
 */
export const setTarget = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    targetBudget: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);

    const settings = await ctx.db
      .query("budgetSettings")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();

    const value = args.targetBudget === null ? undefined : dollars(args.targetBudget);

    if (settings) {
      await ctx.db.patch(settings._id, { targetBudget: value });
    } else {
      await ctx.db.insert("budgetSettings", {
        workspaceId: args.workspaceId,
        targetBudget: value,
      });
    }
  },
});

// ── Categories ────────────────────────────────────────────────────────────────

export const addCategory = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);
    const name = args.name.trim();
    if (!name) throw new Error("Category name is required");

    const cats = await ctx.db
      .query("budgetCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    const maxOrder = cats.reduce((m, c) => Math.max(m, c.order), -1);

    return await ctx.db.insert("budgetCategories", {
      workspaceId: args.workspaceId,
      name,
      order: maxOrder + 1,
      isDefault: false,
    });
  },
});

export const renameCategory = mutation({
  args: { categoryId: v.id("budgetCategories"), name: v.string() },
  handler: async (ctx, args) => {
    const cat = await ctx.db.get(args.categoryId);
    if (!cat) throw new Error("Category not found");
    await assertCanEdit(ctx, cat.workspaceId);

    const name = args.name.trim();
    if (!name) throw new Error("Category name cannot be empty");

    await ctx.db.patch(args.categoryId, { name });
  },
});

/**
 * Delete a category. Blocked if it still has line items — the caller must move
 * or delete those first (per the brief's recommended option).
 */
export const removeCategory = mutation({
  args: { categoryId: v.id("budgetCategories") },
  handler: async (ctx, args) => {
    const cat = await ctx.db.get(args.categoryId);
    if (!cat) throw new Error("Category not found");
    await assertCanEdit(ctx, cat.workspaceId);

    const items = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
      .take(1);
    if (items.length > 0) {
      throw new Error(
        "This category still has line items. Move or delete them before deleting the category."
      );
    }

    await ctx.db.delete(args.categoryId);
  },
});

// ── Line items ──────────────────────────────────────────────────────────────

export const addLineItem = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    categoryId: v.id("budgetCategories"),
    name: v.string(),
    estimatedCost: v.number(),
    actualCost: v.optional(v.number()),
    paidStatus: paidStatusValidator,
    amountPaid: v.optional(v.number()),
    notes: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    vendor: v.optional(v.string()), // legacy free text; vendorId is preferred
  },
  handler: async (ctx, args) => {
    await assertCanEdit(ctx, args.workspaceId);

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.workspaceId !== args.workspaceId) {
      throw new Error("Category not found in this workspace");
    }
    const name = args.name.trim();
    if (!name) throw new Error("Line item name is required");

    if (args.vendorId !== undefined) {
      const vendor = await ctx.db.get(args.vendorId);
      if (!vendor || vendor.workspaceId !== args.workspaceId) {
        throw new Error("Vendor not found in this workspace");
      }
    }

    return await ctx.db.insert("budgetLineItems", {
      workspaceId: args.workspaceId,
      categoryId: args.categoryId,
      name,
      estimatedCost: dollars(args.estimatedCost),
      actualCost: args.actualCost != null ? dollars(args.actualCost) : undefined,
      paidStatus: args.paidStatus,
      amountPaid:
        args.paidStatus === "partial" && args.amountPaid != null
          ? dollars(args.amountPaid)
          : undefined,
      notes: args.notes?.trim() || undefined,
      vendorId: args.vendorId,
      // Picking a real vendor supersedes any legacy free text.
      vendor: args.vendorId ? undefined : args.vendor?.trim() || undefined,
    });
  },
});

/**
 * Update a line item. Partial — only provided fields change. Switching paid
 * status away from "partial" clears amountPaid.
 */
export const updateLineItem = mutation({
  args: {
    lineItemId: v.id("budgetLineItems"),
    categoryId: v.optional(v.id("budgetCategories")),
    name: v.optional(v.string()),
    estimatedCost: v.optional(v.number()),
    actualCost: v.optional(v.union(v.number(), v.null())),
    paidStatus: v.optional(paidStatusValidator),
    amountPaid: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.string()),
    // Pass a vendorId to link (and clear any legacy text), or null to unlink.
    vendorId: v.optional(v.union(v.id("vendors"), v.null())),
    vendor: v.optional(v.string()), // legacy free text; vendorId is preferred
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.lineItemId);
    if (!item) throw new Error("Line item not found");
    await assertCanEdit(ctx, item.workspaceId);

    if (args.name !== undefined && !args.name.trim()) {
      throw new Error("Line item name cannot be empty");
    }
    if (args.categoryId !== undefined) {
      const cat = await ctx.db.get(args.categoryId);
      if (!cat || cat.workspaceId !== item.workspaceId) {
        throw new Error("Category not found in this workspace");
      }
    }
    if (args.vendorId !== undefined && args.vendorId !== null) {
      const vendor = await ctx.db.get(args.vendorId);
      if (!vendor || vendor.workspaceId !== item.workspaceId) {
        throw new Error("Vendor not found in this workspace");
      }
    }

    // Effective paid status after this update, to keep amountPaid consistent.
    const nextStatus = args.paidStatus ?? item.paidStatus;

    await ctx.db.patch(args.lineItemId, {
      ...(args.categoryId !== undefined ? { categoryId: args.categoryId } : {}),
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.estimatedCost !== undefined
        ? { estimatedCost: dollars(args.estimatedCost) }
        : {}),
      ...(args.actualCost !== undefined
        ? { actualCost: args.actualCost === null ? undefined : dollars(args.actualCost) }
        : {}),
      ...(args.paidStatus !== undefined ? { paidStatus: args.paidStatus } : {}),
      ...(args.notes !== undefined ? { notes: args.notes.trim() || undefined } : {}),
      // Vendor link: setting vendorId clears the stale legacy text (lazy
      // migration). null unlinks. A bare `vendor` (no vendorId) still updates
      // the legacy text for backward compatibility.
      ...(args.vendorId !== undefined
        ? args.vendorId === null
          ? { vendorId: undefined }
          : { vendorId: args.vendorId, vendor: undefined }
        : args.vendor !== undefined
        ? { vendor: args.vendor.trim() || undefined }
        : {}),
      // amountPaid only persists for partial; cleared otherwise.
      ...(nextStatus !== "partial"
        ? { amountPaid: undefined }
        : args.amountPaid !== undefined
        ? { amountPaid: args.amountPaid === null ? undefined : dollars(args.amountPaid) }
        : {}),
    });
  },
});

export const removeLineItem = mutation({
  args: { lineItemId: v.id("budgetLineItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.lineItemId);
    if (!item) throw new Error("Line item not found");
    await assertCanEdit(ctx, item.workspaceId);
    await ctx.db.delete(args.lineItemId);
  },
});
