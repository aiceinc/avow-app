import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

/**
 * Convex Auth configuration — email/password only for Phase 2.
 *
 * `auth`     — HTTP handler helper (used in http.ts)
 * `signIn`   — mutation for signing in
 * `signOut`  — mutation for signing out
 * `store`    — internal mutation Convex Auth uses to persist session data
 */
export const { auth, signIn, signOut, store } = convexAuth({
  providers: [Password],
});
