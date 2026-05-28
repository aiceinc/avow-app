/**
 * identity.ts — Phase 2 cursors gate harness
 *
 * In the absence of real auth, we identify users by a `?user=` URL param.
 * Two browser tabs at:
 *   http://localhost:3000/?user=A  →  userId = 'A', label = 'User A'
 *   http://localhost:3000/?user=B  →  userId = 'B', label = 'User B'
 *
 * This is throwaway scaffolding — replaced entirely when Convex Auth lands
 * in §3. It's isolated here so the replacement is a single-file swap.
 *
 * Must only be called on the client (reads window.location).
 */

export type UserIdentity = {
  userId: string;
  label:  string;
  color:  string; // hex — each user gets a distinct cursor colour
};

const USER_COLORS: Record<string, string> = {
  A: '#3b82f6', // blue
  B: '#f97316', // orange
  C: '#10b981', // emerald
  D: '#a855f7', // purple
};

const DEFAULT_COLOR = '#6b7280'; // gray fallback

export function getLocalIdentity(): UserIdentity {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const raw    = params.get('user') ?? 'A';
  const userId = raw.toUpperCase().slice(0, 8); // normalise, cap length
  return {
    userId,
    label: `User ${userId}`,
    color: USER_COLORS[userId] ?? DEFAULT_COLOR,
  };
}
