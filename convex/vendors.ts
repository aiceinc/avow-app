import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember } from "./lib";

/**
 * Vendors module (v1.4.0). Mirrors the Budget Tracker's backend patterns:
 * managed categories (seeded idempotently, add/rename/delete-when-empty) plus
 * vendor CRUD. Cost is NOT stored here — the budget owns cost; a budgetLineItem
 * points to a vendor via vendorId. See convex/budget.ts.
 */

// ── Shared validators ─────────────────────────────────────────────────────────

const statusValidator = v.union(
  v.literal("researching"),
  v.literal("contacted"),
  v.literal("booked"),
  v.literal("declined")
);

const DEFAULT_CATEGORIES = [
  "Venue",
  "Catering & Bar",
  "Photography & Video",
  "Florist & Decor",
  "Music & Entertainment",
  "Officiant",
  "Hair & Makeup",
  "Attire",
  "Cake & Desserts",
  "Stationery",
  "Transportation",
  "Rentals",
  "Other",
];

// ── Queries ───────────────────────────────────────────────────────────────────

/** All vendor categories in a workspace, in display order. */
export const listCategories = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    const cats = await ctx.db
      .query("vendorCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    return cats.sort((a, b) => a.order - b.order);
  },
});

/** All vendors in a workspace. Filtering/sorting is done client-side. */
export const listVendors = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    return await ctx.db
      .query("vendors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
  },
});

// ── Seeding ─────────────────────────────────────────────────────────────────

/**
 * Seed the default vendor categories for a workspace. Idempotent: if the
 * workspace already has any categories, this is a no-op (re-checked here so
 * concurrent first-visits can't double-seed). Mirrors budget.seedDefaultCategories.
 */
export const seedDefaultCategories = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);

    const existing = await ctx.db
      .query("vendorCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(1);
    if (existing.length > 0) return; // already seeded

    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      await ctx.db.insert("vendorCategories", {
        workspaceId: args.workspaceId,
        name: DEFAULT_CATEGORIES[i],
        order: i,
        isDefault: true,
      });
    }
  },
});

// ── Categories ────────────────────────────────────────────────────────────────

export const addCategory = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    const name = args.name.trim();
    if (!name) throw new Error("Category name is required");

    const cats = await ctx.db
      .query("vendorCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    const maxOrder = cats.reduce((m, c) => Math.max(m, c.order), -1);

    return await ctx.db.insert("vendorCategories", {
      workspaceId: args.workspaceId,
      name,
      order: maxOrder + 1,
      isDefault: false,
    });
  },
});

export const renameCategory = mutation({
  args: { categoryId: v.id("vendorCategories"), name: v.string() },
  handler: async (ctx, args) => {
    const cat = await ctx.db.get(args.categoryId);
    if (!cat) throw new Error("Category not found");
    await assertMember(ctx, cat.workspaceId);

    const name = args.name.trim();
    if (!name) throw new Error("Category name cannot be empty");

    await ctx.db.patch(args.categoryId, { name });
  },
});

/**
 * Delete a category. Blocked if any vendor still uses it — the caller must
 * recategorize or delete those vendors first (mirrors budget.removeCategory).
 */
export const removeCategory = mutation({
  args: { categoryId: v.id("vendorCategories") },
  handler: async (ctx, args) => {
    const cat = await ctx.db.get(args.categoryId);
    if (!cat) throw new Error("Category not found");
    await assertMember(ctx, cat.workspaceId);

    const used = await ctx.db
      .query("vendors")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
      .take(1);
    if (used.length > 0) {
      throw new Error(
        "This category still has vendors. Recategorize or delete them before deleting the category."
      );
    }

    await ctx.db.delete(args.categoryId);
  },
});

// ── Vendors ─────────────────────────────────────────────────────────────────

export const addVendor = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    categoryId: v.optional(v.id("vendorCategories")),
    status: statusValidator,
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);

    const name = args.name.trim();
    if (!name) throw new Error("Vendor name is required");

    if (args.categoryId !== undefined) {
      const cat = await ctx.db.get(args.categoryId);
      if (!cat || cat.workspaceId !== args.workspaceId) {
        throw new Error("Category not found in this workspace");
      }
    }

    return await ctx.db.insert("vendors", {
      workspaceId: args.workspaceId,
      name,
      categoryId: args.categoryId,
      status: args.status,
      contactName: args.contactName?.trim() || undefined,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      website: args.website?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });
  },
});

/**
 * Update a vendor. Partial — only provided fields change. Pass null for an
 * optional field to clear it (categoryId/contact fields).
 */
export const updateVendor = mutation({
  args: {
    vendorId: v.id("vendors"),
    name: v.optional(v.string()),
    categoryId: v.optional(v.union(v.id("vendorCategories"), v.null())),
    status: v.optional(statusValidator),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");
    await assertMember(ctx, vendor.workspaceId);

    if (args.name !== undefined && !args.name.trim()) {
      throw new Error("Vendor name cannot be empty");
    }
    if (args.categoryId !== undefined && args.categoryId !== null) {
      const cat = await ctx.db.get(args.categoryId);
      if (!cat || cat.workspaceId !== vendor.workspaceId) {
        throw new Error("Category not found in this workspace");
      }
    }

    await ctx.db.patch(args.vendorId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.categoryId !== undefined
        ? { categoryId: args.categoryId === null ? undefined : args.categoryId }
        : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.contactName !== undefined
        ? { contactName: args.contactName.trim() || undefined }
        : {}),
      ...(args.email !== undefined ? { email: args.email.trim() || undefined } : {}),
      ...(args.phone !== undefined ? { phone: args.phone.trim() || undefined } : {}),
      ...(args.website !== undefined
        ? { website: args.website.trim() || undefined }
        : {}),
      ...(args.notes !== undefined ? { notes: args.notes.trim() || undefined } : {}),
    });
  },
});

/**
 * Delete a vendor. Before deleting, gracefully detach any budget line items
 * that reference it: clear their vendorId and preserve the vendor's name into
 * the legacy free-text `vendor` field, so budget rows still display something
 * meaningful rather than silently losing the reference.
 */
export const removeVendor = mutation({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");
    await assertMember(ctx, vendor.workspaceId);

    const linkedItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .take(500);
    for (const item of linkedItems) {
      await ctx.db.patch(item._id, { vendorId: undefined, vendor: vendor.name });
    }

    await ctx.db.delete(args.vendorId);
  },
});
