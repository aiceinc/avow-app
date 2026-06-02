"use node";

import Stripe from "stripe";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  isTier,
  isInterval,
  priceEnvVar,
  TRIAL_PERIOD_DAYS,
  AUTO_RENEW_DISCLOSURE,
} from "./billingConfig";

/**
 * Stripe billing actions (v1.11.0, TEST MODE). Holds the Stripe SDK in the Node
 * runtime. Hosted Checkout + customer portal (no card UI on our side). Keys live
 * in the Convex env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and per-tier price
 * IDs (STRIPE_PRICE_<TIER>_<MONTH|YEAR>) — see convex/billingConfig.ts.
 */

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured in the Convex environment.");
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
      throw new Error("Invalid plan selection.");
    }
    const priceEnv = priceEnvVar(args.tier, args.interval);
    const priceId = process.env[priceEnv];
    if (!priceId) throw new Error(`Stripe price is not configured (${priceEnv}).`);

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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: { workspaceId: args.workspaceId, tier: args.tier, interval: args.interval },
      },
      client_reference_id: args.workspaceId,
      success_url: `${args.origin}/account?billing=success`,
      cancel_url: `${args.origin}/account?billing=cancel`,
      // Auto-renew disclosure shown at the point of checkout (Stripe caps this
      // at 1200 chars). Final wording is Brooke's — see AUTO_RENEW_DISCLOSURE.
      custom_text: { submit: { message: AUTO_RENEW_DISCLOSURE.slice(0, 1200) } },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
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
      throw new Error("No billing account yet — start a subscription first.");
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
 * Verify + process a Stripe webhook event (called by the HTTP route in
 * convex/http.ts). Syncs subscription lifecycle into Convex, which in turn
 * sets/clears the workspace retention trigger.
 */
export const handleWebhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(args.payload, args.signature, secret);
    } catch (err) {
      throw new Error(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) return { ok: true }; // not one of ours

      const item = sub.items?.data?.[0];
      const interval = sub.metadata?.interval ?? item?.price?.recurring?.interval ?? "month";
      const tier = sub.metadata?.tier ?? "standard";
      // current_period_end moved from the subscription to the subscription item
      // in Stripe's 2025 API — read from the item, falling back to the sub for
      // older API versions.
      const periodEnd =
        item?.current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end;

      await ctx.runMutation(internal.subscriptions.upsertFromStripe, {
        workspaceId: workspaceId as Id<"workspaces">,
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        status: sub.status,
        tier,
        interval,
        currentPeriodEnd: periodEnd ?? undefined,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? undefined,
        trialEnd: sub.trial_end ?? undefined,
      });
    }

    return { ok: true };
  },
});
