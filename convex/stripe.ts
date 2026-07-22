"use node";

import Stripe from "stripe";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  isTier,
  isInterval,
  priceEnvVar,
  autoRenewDisclosure,
  TRIAL_PERIOD_DAYS,
} from "./billingConfig";

/**
 * Stripe billing actions (v1.11.0, TEST MODE). Holds the Stripe SDK in the Node
 * runtime. Hosted Checkout + customer portal (no card UI on our side). Keys live
 * in the Convex env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and per-tier price
 * IDs (STRIPE_PRICE_<TIER>_<MONTH|YEAR>) — see convex/billingConfig.ts.
 */

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ConvexError("STRIPE_SECRET_KEY is not configured in the Convex environment.");
  return new Stripe(key);
}

/** Create a hosted Checkout session for a tier+interval and return its URL. */
export const createCheckoutSession = action({
  args: {
    workspaceId: v.id("workspaces"),
    tier: v.string(),
    interval: v.string(),
    origin: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    if (!isTier(args.tier) || !isInterval(args.interval)) {
      throw new ConvexError("Invalid plan selection.");
    }
    const priceEnv = priceEnvVar(args.tier, args.interval);
    const priceId = process.env[priceEnv];
    if (!priceId) throw new ConvexError(`Stripe price is not configured (${priceEnv}).`);

    // Auth + membership check, and read/ensure the Stripe customer.
    const conf = await ctx.runQuery(internal.subscriptions.getCheckoutContext, {
      workspaceId: args.workspaceId,
    });
    const stripe = getStripe();

    let customerId = conf.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: conf.email ?? undefined,
        name: conf.workspaceName ?? undefined,
        metadata: { workspaceId: args.workspaceId },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.subscriptions.setCustomerId, {
        workspaceId: args.workspaceId,
        stripeCustomerId: customerId,
      });
    }

    // Free trial (v1.24.0): available on ANY tier, once per user. Checkout always
    // collects a card (subscription mode's default), so Stripe can convert the
    // trial to a paid subscription automatically on day TRIAL_PERIOD_DAYS unless
    // the user cancels — no app-side scheduling needed. Eligibility is decided
    // server-side in getCheckoutContext; a user who already used their trial gets
    // a normal paid subscription charged immediately.
    const withTrial = conf.trialEligible;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(withTrial ? { trial_period_days: TRIAL_PERIOD_DAYS } : {}),
        metadata: {
          workspaceId: args.workspaceId,
          tier: args.tier,
          interval: args.interval,
          userId: conf.userId, // buyer → ownerUserId (account-level Planner coverage)
        },
      },
      client_reference_id: args.workspaceId,
      success_url: `${args.origin}/account?billing=success`,
      cancel_url: `${args.origin}/account?billing=cancel`,
      // Auto-renew disclosure shown at the point of checkout (Stripe caps this at
      // 1200 chars). MUST match the checkout the user is actually getting — the
      // trial variant promises a deferred first charge. Final wording is Brooke's.
      custom_text: { submit: { message: autoRenewDisclosure(withTrial).slice(0, 1200) } },
    });
    if (!session.url) throw new ConvexError("Stripe did not return a checkout URL.");
    return { url: session.url };
  },
});

/** Create a Stripe customer-portal session (manage / upgrade / downgrade / cancel). */
export const createPortalSession = action({
  args: { workspaceId: v.id("workspaces"), origin: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const conf = await ctx.runQuery(internal.subscriptions.getCheckoutContext, {
      workspaceId: args.workspaceId,
    });
    if (!conf.stripeCustomerId) {
      throw new ConvexError("No billing account yet — start a subscription first.");
    }
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: conf.stripeCustomerId,
      return_url: `${args.origin}/account`,
    });
    return { url: session.url };
  },
});

/**
 * Map a Stripe subscription onto our upsertFromStripe args, or null when the
 * subscription isn't one of ours (no workspaceId in its metadata).
 *
 * Two fields have moved in Stripe's recent API versions, so both are read
 * defensively rather than trusted:
 *
 *  - `current_period_end` moved from the subscription to the subscription item.
 *  - `cancel_at_period_end` is no longer set when a subscription is cancelled at
 *    period end. On 2026-05-27.dahlia (this account's version) the customer
 *    portal leaves that boolean `false` and instead sets `cancel_at` to the
 *    instant the subscription will end. Reading only the boolean made the app
 *    show "your plan starts automatically" to someone who had just cancelled,
 *    so treat EITHER signal as winding down.
 */
function subscriptionUpsertArgs(sub: Stripe.Subscription) {
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) return null;

  const item = sub.items?.data?.[0];
  const legacy = sub as unknown as {
    current_period_end?: number;
    cancel_at?: number | null;
    cancel_at_period_end?: boolean;
  };
  const periodEnd = item?.current_period_end ?? legacy.current_period_end;
  const cancelling = legacy.cancel_at_period_end === true || typeof legacy.cancel_at === "number";
  const ownerUserId = sub.metadata?.userId;

  return {
    workspaceId: workspaceId as Id<"workspaces">,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    tier: sub.metadata?.tier ?? "couple",
    interval: sub.metadata?.interval ?? item?.price?.recurring?.interval ?? "month",
    currentPeriodEnd: periodEnd ?? undefined,
    cancelAtPeriodEnd: cancelling,
    trialEnd: sub.trial_end ?? undefined,
    ownerUserId: ownerUserId ? (ownerUserId as Id<"users">) : undefined,
  };
}

/**
 * Re-read a subscription from Stripe and write it into Convex. Webhooks are the
 * normal path; this is the repair path for when one is missed, mis-read, or
 * fired before a mapping bug was fixed. Run it with:
 *   npx convex run stripe:resyncSubscription '{"subscriptionId":"sub_…"}'
 */
export const resyncSubscription = internalAction({
  args: { subscriptionId: v.string() },
  handler: async (ctx, args): Promise<{ synced: boolean }> => {
    const sub = await getStripe().subscriptions.retrieve(args.subscriptionId);
    const upsertArgs = subscriptionUpsertArgs(sub);
    if (!upsertArgs) return { synced: false };
    await ctx.runMutation(internal.subscriptions.upsertFromStripe, upsertArgs);
    return { synced: true };
  },
});

/**
 * Verify + process a Stripe webhook event (called by the HTTP route in
 * convex/http.ts). Syncs subscription lifecycle into Convex, which in turn
 * sets/clears the workspace retention trigger.
 */
export const handleWebhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ConvexError("STRIPE_WEBHOOK_SECRET is not configured.");
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(args.payload, args.signature, secret);
    } catch (err) {
      throw new ConvexError(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const upsertArgs = subscriptionUpsertArgs(event.data.object as Stripe.Subscription);
      if (!upsertArgs) return { ok: true }; // not one of ours (no workspace metadata)
      await ctx.runMutation(internal.subscriptions.upsertFromStripe, upsertArgs);
    } else if (
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment_succeeded"
    ) {
      // Flag/clear a failed payment so the app can surface an "update your card"
      // banner. (subscription.updated also moves status to past_due, but this is
      // the explicit, earliest signal.) Read the subscription id defensively
      // across Stripe API shapes.
      const invoice = event.data.object as Stripe.Invoice;
      const raw =
        (invoice as unknown as { subscription?: string | { id: string } }).subscription ??
        (invoice as unknown as {
          parent?: { subscription_details?: { subscription?: string | { id: string } } };
        }).parent?.subscription_details?.subscription;
      const subscriptionId = typeof raw === "string" ? raw : raw?.id;
      if (subscriptionId) {
        await ctx.runMutation(internal.subscriptions.setPaymentFailed, {
          stripeSubscriptionId: subscriptionId,
          failed: event.type === "invoice.payment_failed",
        });
      }
    }

    return { ok: true };
  },
});
