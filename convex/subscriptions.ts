import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { assertMember, trialEndsAtFor, workspaceHasPlannerMember } from "./lib";
import { TRIAL_PERIOD_DAYS } from "./billingConfig";

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

/**
 * The workspace's entitlement facts for the client UI (banners, paywall, trial
 * countdown). Raw facts only — the client derives in/out-of-trial against its own
 * clock so this stays a reactive query with no Date.now(). The authoritative
 * write-time gate is assertCanEdit (convex/lib.ts).
 */
export const getEntitlement = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await assertMember(ctx, args.workspaceId);
    const ws = await ctx.db.get(args.workspaceId);
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(50);
    const live = subs.find((s) =>
      ["active", "trialing", "past_due"].includes(s.status)
    );
    // Account-level Planner: a member's Planner plan covers this workspace at
    // Pro level even without its own subscription.
    const plannerCovered = await workspaceHasPlannerMember(ctx, args.workspaceId);
    return {
      trialEndsAt: ws ? trialEndsAtFor(ws) : 0, // unix ms
      trialPeriodDays: TRIAL_PERIOD_DAYS,
      hasSubscription: plannerCovered || !!live,
      subStatus: plannerCovered ? "active" : live?.status ?? null,
      tier: plannerCovered ? "planner" : live?.tier ?? null,
      // True only when this workspace has its OWN subscription covered by a Planner
      // plan held elsewhere (no own sub row), so the UI can show an info note.
      plannerCovered: plannerCovered && !live,
      paymentFailed:
        !plannerCovered && !!(live && (live.status === "past_due" || live.paymentFailed)),
    };
  },
});

/** Auth-gated billing context for the Stripe actions: verifies the caller is a
 *  member of the workspace and returns the customer id + identity bits + the
 *  workspace creation time (so checkout can honour any remaining free-trial days). */
export const getCheckoutContext = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const userId = await assertMember(ctx, args.workspaceId);
    const user = await ctx.db.get(userId);
    const ws = await ctx.db.get(args.workspaceId);
    return {
      userId, // buyer — recorded as the subscription's ownerUserId (Planner coverage)
      stripeCustomerId: ws?.stripeCustomerId ?? null,
      email: user?.email ?? null,
      workspaceName: ws?.name ?? null,
      trialEndsAt: ws ? trialEndsAtFor(ws) : 0, // unix ms
    };
  },
});

/** Set/clear the payment-failed flag on a subscription (invoice.* webhooks). */
export const setPaymentFailed = internalMutation({
  args: { stripeSubscriptionId: v.string(), failed: v.boolean() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique();
    if (sub) await ctx.db.patch(sub._id, { paymentFailed: args.failed });
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
    ownerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique();
    // Keep paymentFailed consistent with status: a return to good standing
    // clears it; past_due sets it; otherwise preserve whatever the invoice
    // webhooks recorded.
    const paymentFailed = ACTIVE_STATUSES.includes(args.status)
      ? false
      : args.status === "past_due"
        ? true
        : existing?.paymentFailed;
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
      paymentFailed,
      // Preserve the buyer attribution across updates if a later event omits it.
      ownerUserId: args.ownerUserId ?? existing?.ownerUserId,
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
