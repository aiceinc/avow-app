import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled jobs (v1.9.0).
 *
 * Daily data-retention sweep. With the retention trigger
 * (`workspaces.subscriptionLapsedAt`) unset on every workspace today, this
 * purges nothing — it becomes live the moment billing starts setting that
 * field. See convex/retention.ts.
 */
const crons = cronJobs();

crons.interval(
  "purge expired workspaces",
  { hours: 24 },
  internal.retention.purgeExpiredWorkspaces,
  {} // dryRun defaults to false; safe because the trigger is unset everywhere
);

export default crons;
