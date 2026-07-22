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

/**
 * Free-trial length in days (re-introduced 2026-07-21, replacing the no-trial
 * model of v1.16.0).
 *
 * This trial is STRIPE-MANAGED and card-gated, which is materially different
 * from the app-managed, no-card, Couple-only trial that existed before v1.16.0:
 *   - Stripe Checkout collects a payment method BEFORE the trial starts.
 *   - The subscription is created in `trialing` on the tier the user CHOSE
 *     (any of the three), so entitlement flows through the normal status path.
 *   - At the end of the trial Stripe charges the card automatically and the
 *     subscription becomes `active` — unless the user cancels first.
 * Requiring a card up front is what closes the "trial-and-leave" hole that
 * motivated removing the old trial.
 *
 * ⚠️ COUPLED TO A PUBLISHED LEGAL PROMISE — do not lower below 8 without reading
 * this. The trial-ending reminder email is sent by STRIPE (Dashboard → Settings →
 * Subscriptions and emails → "Send a reminder email 7 days before a trial ends").
 * That window is FIXED at 7 days and Stripe does not send the email at all for
 * trials of 7 days or fewer. Our Terms of Service §10 and Privacy Policy §13 both
 * promise "we send a reminder before your trial converts", so shortening this to
 * ≤7 would silently break a published commitment — you'd have to build the
 * reminder in-app first (the app has no transactional email today).
 */
export const TRIAL_PERIOD_DAYS = 14;

/** The trial requires a card at sign-up — this is what enables the automatic
 *  trial→paid conversion. (Was `false` for the old app-managed trial.) */
export const TRIAL_REQUIRES_CARD = true;

/** One trial per user, ever. Enforced by checking whether any subscription
 *  attributed to the buyer (`ownerUserId`) has ever carried a `trialEnd` —
 *  see `subscriptions.getCheckoutContext`. A user who already used their trial
 *  goes straight to a paid subscription at checkout. */
export const TRIAL_ONCE_PER_USER = true;

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
 * these strings when Brooke provides them.
 *
 * TWO variants, because the two checkout paths make materially different
 * promises and the trial-conversion one is the regulated case:
 *   - TRIAL: card taken now, first charge deferred to the end of the trial.
 *   - PAID:  charged immediately (a user who already used their one trial).
 * Always select via `autoRenewDisclosure(withTrial)` so we never show a user a
 * trial promise they aren't actually getting.
 */
export const TRIAL_AUTO_RENEW_DISCLOSURE =
  `[PENDING LEGAL — placeholder, not final wording] Your ${TRIAL_PERIOD_DAYS}-day free trial starts today and requires a ` +
  `valid payment method. You will not be charged during the trial. Unless you cancel before it ends, your payment method ` +
  `will automatically be charged for the plan you selected when the trial ends, and the subscription renews each billing ` +
  `period at the then-current price until you cancel. We email you before the trial converts. You can cancel any time ` +
  `from your account; cancellation takes effect at the end of the current billing period.`;

export const AUTO_RENEW_DISCLOSURE =
  `[PENDING LEGAL — placeholder, not final wording] By subscribing, your payment method is charged immediately for the ` +
  `plan you selected and your subscription begins right away. It renews automatically each billing period at the ` +
  `then-current price until you cancel. You can cancel any time from your account; cancellation takes effect at the ` +
  `end of the current billing period.`;

/** Pick the disclosure that matches the checkout the user is actually getting. */
export function autoRenewDisclosure(withTrial: boolean): string {
  return withTrial ? TRIAL_AUTO_RENEW_DISCLOSURE : AUTO_RENEW_DISCLOSURE;
}
