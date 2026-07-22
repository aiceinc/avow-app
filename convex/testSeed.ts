/**
 * testSeed.ts — DEV / TEST-MODE ONLY helpers for managing test accounts.
 *
 * Run with `npx convex run` against the DEV deployment, e.g.:
 *   npx convex run testSeed:createTestAccount '{"email":"plannerpro@test.com","password":"testpassword","tier":"planner_pro","workspaceName":"Planner Pro Studio"}'
 *   npx convex run testSeed:seedSubscription  '{"email":"plannerpro@test.com","tier":"planner_max"}'
 *   npx convex run testSeed:wipeUser          '{"email":"old@test.com"}'
 *
 * Every function is HARD-GUARDED to @test.com / @avow.test emails so it can never
 * touch a real account. Seeded subscriptions are FAKE (no Stripe object behind
 * them): perfect for exercising tier-gated features, but "Manage billing" / the
 * customer portal won't work on a seeded account — use a real Checkout for that.
 *
 * Not imported by any app code. Safe to leave in the repo; it only does anything
 * when explicitly invoked via `npx convex run` (and refuses non-test emails).
 */

import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { createAccount } from "@convex-dev/auth/server";
import { purgeWorkspace } from "./lib";
import { isTier } from "./billingConfig";

/** Only operate on obvious test accounts. */
const TEST_EMAIL = /@(test\.com|avow\.test)$/i;
function assertTestEmail(email: string) {
  if (!TEST_EMAIL.test(email)) {
    throw new Error(
      `Refusing: this helper only operates on @test.com / @avow.test test accounts (got "${email}").`
    );
  }
}

/** Create a real, login-able Password account + a workspace, optionally with a
 *  seeded subscription of `tier` ('free'/'none' = no subscription, stays on the
 *  trial). The password is hashed by the configured Password provider. */
export const createTestAccount = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    tier: v.string(), // 'free' | 'none' | 'couple' | 'planner_pro' | 'planner_max'
    workspaceName: v.string(),
  },
  handler: async (ctx, args): Promise<{ email: string; tier: string }> => {
    assertTestEmail(args.email);
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: args.email, secret: args.password },
      profile: { email: args.email },
    });
    await ctx.runMutation(internal.testSeed.provisionUser, {
      userId: user._id as Id<"users">,
      workspaceName: args.workspaceName,
      tier: args.tier,
    });
    return { email: args.email, tier: args.tier };
  },
});

/** Internal: create the workspace + membership for a freshly-made user, and seed
 *  a fake active subscription unless the tier is 'free'/'none'. */
export const provisionUser = internalMutation({
  args: {
    userId: v.id("users"),
    workspaceName: v.string(),
    tier: v.string(),
  },
  handler: async (ctx, args) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.workspaceName,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: args.userId,
    });
    if (args.tier !== "free" && args.tier !== "none") {
      if (!isTier(args.tier)) throw new Error(`Invalid tier "${args.tier}".`);
      await ctx.db.insert("subscriptions", {
        workspaceId,
        stripeCustomerId: `seed_cus_${args.userId}`,
        stripeSubscriptionId: `seed_sub_${workspaceId}`,
        status: "active",
        tier: args.tier,
        interval: "month",
        cancelAtPeriodEnd: false,
        paymentFailed: false,
        ownerUserId: args.userId,
      });
    }
    return workspaceId;
  },
});

/** Attach/overwrite a fake active subscription of `tier` on the first workspace
 *  of an EXISTING test user (by email). For changing an account's tier without
 *  recreating it. */
export const seedSubscription = internalMutation({
  args: {
    email: v.string(),
    tier: v.string(),
    /** Subscription status to seed. Defaults to "active". Pass "trialing" (with
     *  trialDays) to exercise the free-trial UI without a real Stripe Checkout,
     *  which the sandboxed preview can't drive. */
    status: v.optional(v.string()),
    /** Days until the trial converts. Sets `trialEnd` (unix SECONDS, matching
     *  Stripe's `trial_end`). Only meaningful with status "trialing". */
    trialDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertTestEmail(args.email);
    if (!isTier(args.tier)) throw new Error(`Invalid tier "${args.tier}".`);
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();
    if (!user) throw new Error(`No user with email "${args.email}".`);
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!membership) {
      throw new Error(`"${args.email}" has no workspace yet — sign in once first.`);
    }
    const workspaceId = membership.workspaceId;
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .first();
    const status = args.status ?? "active";
    const row = {
      workspaceId,
      stripeCustomerId: `seed_cus_${user._id}`,
      stripeSubscriptionId: existing?.stripeSubscriptionId ?? `seed_sub_${workspaceId}`,
      status,
      tier: args.tier,
      interval: "month",
      cancelAtPeriodEnd: false,
      paymentFailed: false,
      ownerUserId: user._id,
      // unix SECONDS, like Stripe's trial_end. Cleared when not trialing so a
      // re-seed back to "active" also clears the one-trial-per-user marker.
      trialEnd:
        args.trialDays != null
          ? Math.floor(Date.now() / 1000) + args.trialDays * 86400
          : undefined,
    };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("subscriptions", row);
    await ctx.db.patch(workspaceId, { subscriptionLapsedAt: undefined });
    return { email: args.email, tier: args.tier, status, workspaceId };
  },
});

/** Delete subscription rows whose tier is no longer a valid tier — legacy cruft
 *  left over from a tier rename (e.g. old 'standard'/'pro'/'planner' rows). */
export const purgeLegacySubscriptions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const subs = await ctx.db.query("subscriptions").take(1000);
    let deleted = 0;
    for (const s of subs) {
      if (!isTier(s.tier)) {
        await ctx.db.delete(s._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

/** Hard-delete a test user: their workspaces (purged when they're the last
 *  member), then their full auth footprint. Mirrors account.deleteMyAccount. */
export const wipeUser = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    assertTestEmail(args.email);
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();
    if (!user) return { deleted: false, reason: "not found" as const };
    const userId = user._id;

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    for (const m of memberships) {
      await ctx.db.delete(m._id);
      const remaining = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", m.workspaceId))
        .take(1);
      if (remaining.length === 0) await purgeWorkspace(ctx, m.workspaceId);
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(200);
    for (const s of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
        .take(500);
      for (const t of tokens) await ctx.db.delete(t._id);
      await ctx.db.delete(s._id);
    }
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(100);
    for (const a of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", a._id))
        .take(200);
      for (const c of codes) await ctx.db.delete(c._id);
      await ctx.db.delete(a._id);
    }
    const email = user.email;
    if (email) {
      const limits = await ctx.db
        .query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", email))
        .take(100);
      for (const l of limits) await ctx.db.delete(l._id);
    }
    await ctx.db.delete(userId);
    return { deleted: true, email: args.email };
  },
});
