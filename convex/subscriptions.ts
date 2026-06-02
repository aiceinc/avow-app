import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember } from "./lib";

/**
 * Subscriptions (Stripe billing, v1.11.0) — the Convex side of the webhook
 * pipeline. Public `getMy` for the UI; internal helpers used by the Stripe
 * actions (convex/stripe.ts). Billing data is AUTHED-ONLY (never in public.ts).
 */

const ACTIVE_STATUSES = ["active", "trialing"];
const LAPSED_STATUSES = ["canceled", "unpaid", "incomplete_expired"];

/** The workspace's current subscription (prefers an active/trialing/past_due row,
 *  else the most recent). Null if the workspace has never subscribed. */
export const getMy = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(50);
    const live = subs.find((s) =>
      ["active", "trialing", "past_due"].includes(s.status)
    );
    return live ?? subs[0] ?? null;
  },
});

/** Auth-gated billing context for the Stripe actions: verifies the caller is a
 *  member of the workspace and returns the customer id + identity bits. */
export const getCheckoutContext = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const userId = await assertMember(ctx, args.workspaceId);
    const user = await ctx.db.get(userId);
    const ws = await ctx.db.get(args.workspaceId);
    return {
      stripeCustomerId: ws?.stripeCustomerId ?? null,
      email: user?.email ?? null,
      workspaceName: ws?.name ?? null,
    };
  },
});

/** Persist the Stripe customer id on the workspace (first checkout). */
export const setCustomerId = internalMutation({
  args: { workspaceId: v.id("workspaces"), stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workspaceId, { stripeCustomerId: args.stripeCustomerId });
  },
});

/**
 * Upsert subscription state from a Stripe webhook event (keyed by Stripe
 * subscription id), then reconcile the workspace's retention trigger
 * (`subscriptionLapsedAt`): cleared while any active/trialing subscription
 * exists; set (once) on a lapse event when none does.
 */
export const upsertFromStripe = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.string(),
    tier: v.string(),
    interval: v.string(),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    trialEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique();
    const row = {
      workspaceId: args.workspaceId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      status: args.status,
      tier: args.tier,
      interval: args.interval,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      trialEnd: args.trialEnd,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("subscriptions", row);
    }

    const ws = await ctx.db.get(args.workspaceId);
    if (ws && ws.stripeCustomerId !== args.stripeCustomerId) {
      await ctx.db.patch(args.workspaceId, { stripeCustomerId: args.stripeCustomerId });
    }

    // Reconcile the retention trigger based on the workspace's overall state.
    const all = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50);
    const hasActive = all.some((s) => ACTIVE_STATUSES.includes(s.status));
    if (hasActive) {
      if (ws && ws.subscriptionLapsedAt != null) {
        await ctx.db.patch(args.workspaceId, { subscriptionLapsedAt: undefined });
      }
    } else if (LAPSED_STATUSES.includes(args.status)) {
      if (ws && ws.subscriptionLapsedAt == null) {
        await ctx.db.patch(args.workspaceId, { subscriptionLapsedAt: Date.now() });
      }
    }
  },
});
