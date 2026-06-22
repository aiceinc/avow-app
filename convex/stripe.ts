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

    // The free trial is app-managed, Standard-level, and needs no card. Choosing
    // a paid plan ENDS the trial: we start a normal paid subscription with NO
    // Stripe trial, so the customer is charged immediately and the paid term
    // begins right away (no "N days free of <paid tier>").
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
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
      // Auto-renew disclosure shown at the point of checkout (Stripe caps this
      // at 1200 chars). Final wording is Brooke's — see AUTO_RENEW_DISCLOSURE.
      custom_text: { submit: { message: AUTO_RENEW_DISCLOSURE.slice(0, 1200) } },
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
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) return { ok: true }; // not one of ours

      const item = sub.items?.data?.[0];
      const interval = sub.metadata?.interval ?? item?.price?.recurring?.interval ?? "month";
      const tier = sub.metadata?.tier ?? "couple";
      // current_period_end moved from the subscription to the subscription item
      // in Stripe's 2025 API — read from the item, falling back to the sub for
      // older API versions.
      const periodEnd =
        item?.current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end;

      const ownerUserId = sub.metadata?.userId;
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
        ownerUserId: ownerUserId ? (ownerUserId as Id<"users">) : undefined,
      });
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
