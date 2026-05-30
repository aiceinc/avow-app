import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { purgeWorkspace } from "./lib";

/**
 * Data-retention enforcement (v1.9.0).
 *
 * The machinery to purge a workspace's data after its subscription has been
 * lapsed for a grace period. Built deliberately so the POLICY is config, not
 * code, because the lawyer confirms the real numbers separately.
 *
 * Trigger: `workspaces.subscriptionLapsedAt` (a timestamp; unset = active).
 * No billing system sets this field yet, so it is unset on every workspace
 * today and this job purges NOTHING in normal operation. When billing is built
 * later, it sets `subscriptionLapsedAt` on lapse (and clears it on resubscribe)
 * — nothing else here has to change.
 */

/** Grace period (days) after a subscription lapses before data is purged.
 *  Parameterized on purpose — change this one line when the policy is confirmed. */
export const RETENTION_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Max workspaces to purge in a single cron run (keeps each run within Convex
 *  transaction limits; the daily cron catches up over subsequent runs). */
const MAX_PURGES_PER_RUN = 25;

/** Bounded scan ceiling for the (small) workspaces table. */
const SCAN_LIMIT = 5000;

/**
 * Purge workspaces whose subscription lapsed more than RETENTION_GRACE_DAYS ago.
 *
 * SAFETY: a workspace is eligible ONLY when `subscriptionLapsedAt` is explicitly
 * set AND older than the cutoff. An unset trigger can never match (explicit
 * `!= null` guard), so nothing is purged today. `dryRun: true` reports the
 * candidates without deleting anything — use it to verify before trusting a run.
 */
export const purgeExpiredWorkspaces = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const cutoff = Date.now() - RETENTION_GRACE_DAYS * DAY_MS;

    // The workspaces table is low-cardinality (one row per wedding). A bounded
    // scan is fine; if it ever exceeds SCAN_LIMIT, revisit with self-scheduling.
    const workspaces = await ctx.db.query("workspaces").take(SCAN_LIMIT);

    let eligible = 0;
    let purged = 0;
    for (const ws of workspaces) {
      const lapsedAt = ws.subscriptionLapsedAt;
      if (lapsedAt == null || lapsedAt > cutoff) continue; // active or within grace
      eligible++;
      if (dryRun) continue;
      if (purged >= MAX_PURGES_PER_RUN) continue; // defer the rest to the next run
      await purgeWorkspace(ctx, ws._id);
      purged++;
    }

    const result = {
      scanned: workspaces.length,
      eligible,
      purged,
      deferred: dryRun ? 0 : Math.max(0, eligible - purged),
      dryRun,
      graceDays: RETENTION_GRACE_DAYS,
    };
    console.log(`[retention] ${JSON.stringify(result)}`);
    return result;
  },
});
