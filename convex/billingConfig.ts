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

/** Card-required free-trial length (Stripe trial_period_days). Prep pack: 14 — NOT final. */
export const TRIAL_PERIOD_DAYS = 14;

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
  `[PENDING LEGAL — placeholder, not final wording] Your subscription begins with a ${TRIAL_PERIOD_DAYS}-day free trial. ` +
  `After the trial ends, your payment method is charged automatically and your plan renews automatically at the start of ` +
  `each billing period at the then-current price until you cancel. You can cancel any time from your account; cancellation ` +
  `takes effect at the end of the current billing period. By starting your trial you authorize these recurring charges.`;
