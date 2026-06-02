/**
 * billingConfig.ts — Stripe subscription term parameters (v1.11.0).
 *
 * Plain constants (no Convex server imports) so BOTH the client UI and the
 * Convex billing functions import from one source. Every term-dependent value
 * lives here (or, for prices, on Stripe's side referenced by env-var price IDs),
 * so post-06-08 changes from Brooke / the founders are config edits — not logic
 * rewrites. See brief_stripe_billing_2026-06-01.md.
 */

export type Tier = 'standard' | 'pro' | 'planner';
export type Interval = 'month' | 'year';

/** Display metadata for the three tiers. Prices live on Stripe (see priceEnvVar). */
export const TIERS: { id: Tier; name: string; envPrefix: string }[] = [
  { id: 'standard', name: 'Standard', envPrefix: 'STRIPE_PRICE_STANDARD' },
  { id: 'pro', name: 'Pro', envPrefix: 'STRIPE_PRICE_PRO' },
  { id: 'planner', name: 'Planner', envPrefix: 'STRIPE_PRICE_PLANNER' },
];

export function isTier(v: string): v is Tier {
  return v === 'standard' || v === 'pro' || v === 'planner';
}
export function isInterval(v: string): v is Interval {
  return v === 'month' || v === 'year';
}

/**
 * Convex env var holding the Stripe price ID for a tier+interval — e.g.
 * STRIPE_PRICE_PRO_MONTH / STRIPE_PRICE_PRO_YEAR. Set these in the Convex
 * deployment env (test mode) so swapping prices is an env edit, no code deploy.
 */
export function priceEnvVar(tier: Tier, interval: Interval): string {
  const prefix = TIERS.find((t) => t.id === tier)?.envPrefix ?? 'STRIPE_PRICE_UNKNOWN';
  return `${prefix}_${interval === 'year' ? 'YEAR' : 'MONTH'}`;
}

// ── Term parameters (fill-in-later set) ──────────────────────────────────────

/** Free-trial length in days. The trial is APP-MANAGED (per workspace, from its
 *  creation time) and requires NO card — see TRIAL_REQUIRES_CARD. It simply ends
 *  after this many days unless the couple adds a card and chooses a plan. */
export const TRIAL_PERIOD_DAYS = 14;

/** The free trial does NOT require a card. Stripe is only involved once the user
 *  actively subscribes (adds a card + picks a plan); we never start a card-gated
 *  Stripe trial. If they subscribe while still inside the free trial, the
 *  remaining trial days are honoured (Checkout `trial_end`) so they aren't
 *  charged early. (v1.11.1) */
export const TRIAL_REQUIRES_CARD = false;

/**
 * Cancellation behavior. 'period_end' (prep-pack default) keeps the subscription
 * active until the end of the paid period; 'immediate' cancels at once. Switching
 * is a one-line change here — the cancel flow reads this.
 */
export const CANCELLATION_MODE: 'period_end' | 'immediate' = 'period_end';

/** Refund policy text (prep pack: no refunds — NOT final; Brooke owns the wording). */
export const REFUND_POLICY_TEXT =
  'Subscriptions are non-refundable. You can cancel at any time and your plan stays active until the end of the current billing period.';

/**
 * ⚠️ AUTO-RENEW DISCLOSURE — LEGALLY REGULATED FILL-IN SLOT.
 * PLACEHOLDER copy pending Brooke's final wording. The UI displays it verbatim at
 * the point of checkout. Do NOT author the final legal language here — replace
 * this whole string when Brooke provides it.
 */
export const AUTO_RENEW_DISCLOSURE =
  `[PENDING LEGAL — placeholder, not final wording] By subscribing, your payment method will be charged for the plan you ` +
  `selected, and your subscription renews automatically each billing period at the then-current price until you cancel. ` +
  `If you subscribe while still inside your ${TRIAL_PERIOD_DAYS}-day free trial, you won't be charged until the trial ends. ` +
  `You can cancel any time from your account; cancellation takes effect at the end of the current billing period.`;
