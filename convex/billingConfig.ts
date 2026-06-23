/**
 * billingConfig.ts — Stripe subscription term parameters (v1.11.0).
 *
 * Plain constants (no Convex server imports) so BOTH the client UI and the
 * Convex billing functions import from one source. Every term-dependent value
 * lives here (or, for prices, on Stripe's side referenced by env-var price IDs),
 * so post-06-08 changes from Brooke / the founders are config edits — not logic
 * rewrites. See brief_stripe_billing_2026-06-01.md.
 */

export type Tier = 'couple' | 'planner_pro' | 'planner_max';
export type Interval = 'month' | 'year';

/** Display metadata for the three tiers. Prices live on Stripe (see priceEnvVar).
 *  Planner-first model (2026-06-22): one single-wedding Couple tier + two
 *  account-level Planner tiers covering multiple weddings (see WEDDING_LIMIT). */
export const TIERS: { id: Tier; name: string; envPrefix: string }[] = [
  { id: 'couple', name: 'Couple', envPrefix: 'STRIPE_PRICE_COUPLE' },
  { id: 'planner_pro', name: 'Planner Pro', envPrefix: 'STRIPE_PRICE_PLANNER_PRO' },
  { id: 'planner_max', name: 'Planner Max', envPrefix: 'STRIPE_PRICE_PLANNER_MAX' },
];

export function isTier(v: string): v is Tier {
  return v === 'couple' || v === 'planner_pro' || v === 'planner_max';
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

// ── Tier feature + limits matrix (v1.15.0 — planner-first) ────────────────────
// All three tiers include EVERY built module (seating, timeline, vendors,
// website) for a full wedding. The real ladder is how many weddings each covers
// (WEDDING_LIMIT): Couple = 1, Planner Pro = 5, Planner Max = 50. Higher-tier
// marketing perks (client portal, branded exports) are not built yet, so they're
// listed on /auth but not enforced here.

/** Built premium modules. (Every current tier includes them; the matrix is kept
 *  so re-introducing a gated tier later stays a config edit.) */
export type Feature = 'seating' | 'timeline' | 'vendors';

/** Features unlocked by each tier. */
export const TIER_FEATURES: Record<Tier, Feature[]> = {
  couple: ['seating', 'timeline', 'vendors'],
  planner_pro: ['seating', 'timeline', 'vendors'],
  planner_max: ['seating', 'timeline', 'vendors'],
};

/** Max guests per wedding by tier; null = unlimited (all tiers, for now). */
export const GUEST_CAP: Record<Tier, number | null> = {
  couple: null,
  planner_pro: null,
  planner_max: null,
};

/** Human label for a gated feature (used in upgrade prompts). */
export const FEATURE_LABEL: Record<Feature, string> = {
  seating: 'Seating planner',
  timeline: 'Day-of timeline',
  vendors: 'Vendor management',
};

/** The lowest tier that includes a given feature (for "Upgrade to X" copy). */
export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  seating: 'couple',
  timeline: 'couple',
  vendors: 'couple',
};

export function tierHasFeature(tier: Tier, feature: Feature): boolean {
  return TIER_FEATURES[tier].includes(feature);
}
export function guestCapFor(tier: Tier): number | null {
  return GUEST_CAP[tier];
}

// ── Wedding (workspace) limits — the real tier differentiator ─────────────────
/** How many weddings each tier covers. Couple = a single wedding; the Planner
 *  tiers are account-level and cover this many weddings under one plan. */
export const WEDDING_LIMIT: Record<Tier, number> = {
  couple: 1,
  planner_pro: 5,
  planner_max: 50,
};

/** The account-level, multi-wedding planner tiers. */
export const PLANNER_TIERS: Tier[] = ['planner_pro', 'planner_max'];

export function isPlannerTier(tier: Tier): boolean {
  return tier === 'planner_pro' || tier === 'planner_max';
}
export function weddingLimitFor(tier: Tier): number {
  return WEDDING_LIMIT[tier];
}

// ── Term parameters ──────────────────────────────────────────────────────────
//
// NO FREE TRIAL (product decision 2026-06-22): a paid subscription is required
// from the start to add or edit anything — there is no trial period. A new user
// can sign up and create a workspace, but it stays read-only until they subscribe.

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
  `[PENDING LEGAL — placeholder, not final wording] By subscribing, your payment method is charged immediately for the ` +
  `plan you selected and your subscription begins right away. It renews automatically each billing period at the ` +
  `then-current price until you cancel. You can cancel any time from your account; cancellation takes effect at the ` +
  `end of the current billing period.`;
