import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth registers its own endpoints under /.well-known/ and /api/auth/
auth.addHttpRoutes(http);

/**
 * Stripe webhook (v1.11.0). Public URL: https://<deployment>.convex.site/stripe/webhook
 * Register this in the Stripe dashboard (TEST mode) for the
 * customer.subscription.* events; the resulting signing secret goes into the
 * Convex env as STRIPE_WEBHOOK_SECRET. The raw body + signature are forwarded to
 * a Node action (convex/stripe.ts) which verifies and processes the event.
 */
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Missing stripe-signature header", { status: 400 });
    const payload = await req.text();
    try {
      await ctx.runAction(internal.stripe.handleWebhook, { payload, signature });
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        `Webhook error: ${err instanceof Error ? err.message : "unknown"}`,
        { status: 400 }
      );
    }
  }),
});

export default http;
