/**
 * setup-stripe-test.js — one-shot creator for Avow's 3 products + 6 prices
 * (TEST MODE). Run once; it prints the 6 STRIPE_PRICE_* env vars to paste into
 * the Convex environment. Safe to re-run: it reuses products/prices that already
 * match (looked up by metadata) instead of creating duplicates.
 *
 * Run from the avow-app repo root (the `stripe` package is already installed):
 *     node scripts/setup-stripe-test.js
 *
 * ⚠️ Paste your TEST secret key below in place of [key]. Do NOT commit this file
 *    with a real key in it — delete the key (or the file) after you've run it.
 *    Confirm the key starts with sk_test_ so you never touch live mode here.
 */

const STRIPE_SECRET_KEY = '[PUT KEY FROM STRIPE TEST DASHBOARD HERE AND REMOVE BRACKETS]';

// Currency for all prices. Change to 'cad' if Avow bills in Canadian dollars.
const CURRENCY = 'cad';

// Tiers + prices, mirroring the pricing UI (annual = 20% off, billed yearly).
// Amounts are in the currency's minor unit (cents). envKey maps to the Convex
// env var names the app reads (see convex/billingConfig.ts).
const TIERS = [
  {
    id: 'couple',
    name: 'Avow — Couple',
    description: 'Everything to plan your own wedding, beautifully, in one place.',
    monthly: 4900, //  $49 / mo
    yearly: 46800, // $468 / yr  ($39/mo equivalent)
  },
  {
    id: 'planner_pro',
    name: 'Avow — Planner Pro',
    description: 'For wedding planners building their book of business (up to 5 weddings).',
    monthly: 9900, //  $99 / mo
    yearly: 94800, // $948 / yr  ($79/mo equivalent)
  },
  {
    id: 'planner_max',
    name: 'Avow — Planner Max',
    description: 'For established studios running many weddings at once (up to 50 weddings).',
    monthly: 39900, //  $399 / mo
    yearly: 382800, // $3,828 / yr  ($319/mo equivalent)
  },
];

// This is a standalone Node (CommonJS) utility, not part of the Next/ESM build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stripe = require('stripe');

async function findOrCreateProduct(stripe, tier) {
  // Match an existing product by our own metadata tag so re-runs don't duplicate.
  const existing = await stripe.products.search({
    query: `metadata['avow_tier']:'${tier.id}' AND active:'true'`,
  });
  if (existing.data[0]) {
    console.log(`  product (reused): ${existing.data[0].id}`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name: tier.name,
    description: tier.description,
    metadata: { avow_tier: tier.id },
  });
  console.log(`  product (created): ${product.id}`);
  return product;
}

async function findOrCreatePrice(stripe, product, tier, interval, amount) {
  const tag = `${tier.id}_${interval}`;
  const existing = await stripe.prices.search({
    query: `metadata['avow_price']:'${tag}' AND active:'true'`,
  });
  if (existing.data[0]) {
    console.log(`    ${interval} price (reused): ${existing.data[0].id}`);
    return existing.data[0];
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency: CURRENCY,
    unit_amount: amount,
    recurring: { interval },
    metadata: { avow_price: tag },
  });
  console.log(`    ${interval} price (created): ${price.id}`);
  return price;
}

async function main() {
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === '[key]') {
    throw new Error('Paste your Stripe TEST secret key into STRIPE_SECRET_KEY first.');
  }
  if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    throw new Error('Refusing to run: key is not a sk_test_ key. This script is TEST MODE only.');
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const envLines = [];

  for (const tier of TIERS) {
    console.log(`\n${tier.name}`);
    const product = await findOrCreateProduct(stripe, tier);
    const month = await findOrCreatePrice(stripe, product, tier, 'month', tier.monthly);
    const year = await findOrCreatePrice(stripe, product, tier, 'year', tier.yearly);
    const PREFIX = `STRIPE_PRICE_${tier.id.toUpperCase()}`;
    envLines.push(`${PREFIX}_MONTH=${month.id}`);
    envLines.push(`${PREFIX}_YEAR=${year.id}`);
  }

  console.log('\n\n===== Paste these into the Convex environment (prod AND dev) =====\n');
  console.log(envLines.join('\n'));
  console.log('\n=================================================================\n');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
