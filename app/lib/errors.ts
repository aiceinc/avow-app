import { ConvexError } from 'convex/values';

/**
 * Extract a user-facing message from a thrown value (v1.15.x).
 *
 * Reads `ConvexError.data` first — the clean message we throw server-side, which
 * Convex passes through to the client verbatim in BOTH dev and production. Plain
 * `Error` messages, by contrast, are redacted to a generic "Server Error" in
 * production, so always throw `ConvexError` for anything a user should read and
 * surface it through this helper instead of `err.message`.
 */
export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (err instanceof ConvexError) {
    const d = err.data;
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object' && typeof (d as { message?: unknown }).message === 'string') {
      return (d as { message: string }).message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
