import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";
import { assertMember } from "./lib";

/**
 * exportData.ts — "Export everything" (data portability).
 *
 * Returns a complete, structured snapshot of one workspace so a member can take
 * their data with them. This is the mechanism the Privacy Policy points at for
 * portability under Quebec Law 25 and the GDPR/UK GDPR, so it deliberately
 * covers every workspace-scoped table that holds user content.
 *
 * Deliberate choices:
 *  - Gated with `assertMember`, NOT `assertCanEdit`. Exporting is a READ, and a
 *    portability right must survive a lapsed subscription — a read-only or
 *    unsubscribed workspace can still get its data out. That is the whole point.
 *  - Scoped to ONE workspace (the app's natural unit). A planner with many
 *    weddings exports each separately.
 *  - `cursors` is excluded: ephemeral presence (a pointer position), not user
 *    content, and it is gone seconds later.
 *  - `workspaceMembers` is reduced to a count, and billing to plan facts with no
 *    Stripe identifiers — so one member's export never leaks another member's
 *    identity or payment tokens.
 *  - Bounded `.take()` reads throughout, per the Convex guidelines.
 */

const MAX = 5000; // generous per-table ceiling; far above any real wedding

/** Drop Convex bookkeeping so the file reads as the user's records, not a DB dump. */
function clean<T extends { _creationTime: number; workspaceId?: unknown }>(rows: T[]) {
  return rows.map((r) => {
    const { _creationTime, workspaceId, ...rest } = r;
    void _creationTime;
    void workspaceId;
    return rest;
  });
}

export const workspaceExport = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx: QueryCtx, args: { workspaceId: Id<"workspaces"> }) => {
    await assertMember(ctx, args.workspaceId);
    const id = args.workspaceId;

    const workspace = await ctx.db.get(id);
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const guests = await ctx.db
      .query("guests")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const layouts = await ctx.db
      .query("seatingLayouts")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const assignments = await ctx.db
      .query("seatAssignments")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const budgetSettings = await ctx.db
      .query("budgetSettings")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(1);
    const budgetCategories = await ctx.db
      .query("budgetCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const budgetLineItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const vendorCategories = await ctx.db
      .query("vendorCategories")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const timelineItems = await ctx.db
      .query("timelineItems")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const sites = await ctx.db
      .query("weddingSites")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(1);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", id))
      .take(MAX);

    const sub = subs[0];

    return {
      exportedAt: new Date().toISOString(),
      format: "avow.workspace-export.v1",
      wedding: workspace
        ? { name: workspace.name, createdAt: new Date(workspace._creationTime).toISOString() }
        : null,
      memberCount: members.length,
      // Plan facts only — no Stripe customer/subscription identifiers.
      billing: sub
        ? {
            tier: sub.tier,
            status: sub.status,
            interval: sub.interval,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
            trialEnd: sub.trialEnd ?? null,
            currentPeriodEnd: sub.currentPeriodEnd ?? null,
          }
        : null,
      guests: clean(guests),
      seating: {
        layouts: clean(layouts),
        tables: clean(tables),
        assignments: clean(assignments),
      },
      budget: {
        settings: clean(budgetSettings)[0] ?? null,
        categories: clean(budgetCategories),
        lineItems: clean(budgetLineItems),
      },
      vendors: {
        categories: clean(vendorCategories),
        vendors: clean(vendors),
      },
      timeline: clean(timelineItems),
      weddingWebsite: clean(sites)[0] ?? null,
      tasks: clean(tasks),
      notes: clean(notes),
    };
  },
});
