'use client';

/**
 * /account — account settings (v1.9.0).
 *
 * Shows the signed-in user's identity and the irreversible "Delete my account
 * and data" capability (data-subject erasure). Deletion runs the
 * account.deleteMyAccount mutation, then signs out and returns to /auth. Guarded
 * by a type-to-confirm step because it is destructive and cannot be undone.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useAction } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@/convex/_generated/api';
import { PRIVACY_CONTACT_EMAIL } from '@/app/lib/config';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { errorMessage } from '@/app/lib/errors';
import {
  TIERS,
  type Tier,
  type Interval,
  isTier,
  isInterval,
  isPlannerTier,
  AUTO_RENEW_DISCLOSURE,
  REFUND_POLICY_TEXT,
} from '@/convex/billingConfig';

export default function AccountPage() {
  const me = useQuery(api.workspaces.getMyUserId);
  const deleteMyAccount = useMutation(api.account.deleteMyAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount({});
      // The mutation deleted our sessions; clear the client token and leave.
      await signOut().catch(() => {});
      router.replace('/auth');
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not delete your account.'));
      setDeleting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="min-h-full flex flex-col">
      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
        <h1 className="font-serif text-2xl text-ink">Account</h1>

        {/* Identity */}
        <section className="border border-rule rounded-xl bg-white/60 p-5">
          <h2 className="font-serif text-lg text-ink mb-3">Your details</h2>
          {me === undefined ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : me === null ? (
            <p className="text-sm text-ink-faint">Not signed in.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-20 text-ink-faint shrink-0">Name</dt>
                <dd className="text-ink">{me.name || <span className="text-ink-faint">—</span>}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 text-ink-faint shrink-0">Email</dt>
                <dd className="text-ink">{me.email || <span className="text-ink-faint">—</span>}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* Billing & subscription */}
        <BillingSection />

        {/* Danger zone — delete account + data */}
        <section className="border border-red-200 rounded-xl bg-red-50/40 p-5">
          <h2 className="font-serif text-lg text-ink mb-1">Delete account &amp; data</h2>
          <p className="text-sm text-ink-soft leading-relaxed mb-2">
            Permanently delete your account and your wedding planning data — guests, seating,
            budget, vendors, timeline, and your wedding website. <strong>This can&apos;t be undone.</strong>
          </p>
          <p className="text-xs text-ink-faint leading-relaxed mb-4">
            If you share a wedding with a partner, your account is removed but the wedding&apos;s data
            stays with them. A wedding with no remaining members is deleted entirely.
          </p>

          {!confirming ? (
            <button
              onClick={() => { setConfirming(true); setError(null); }}
              className="btn text-sm px-4 py-2 bg-red-600 text-white border-red-600 hover:bg-red-700"
            >
              Delete my account and data
            </button>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-ink-soft">
                Type <span className="font-mono text-ink">DELETE</span> to confirm
              </label>
              <input
                autoFocus
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="app-input w-full max-w-xs text-sm px-3 py-2.5"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={!canDelete || deleting}
                  className="btn text-sm px-4 py-2 bg-red-600 text-white border-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600"
                >
                  {deleting ? 'Deleting…' : 'Permanently delete'}
                </button>
                <button
                  onClick={() => { setConfirming(false); setConfirmText(''); setError(null); }}
                  disabled={deleting}
                  className="btn btn-secondary text-sm px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </section>

        {/* Privacy contact */}
        <p className="text-xs text-ink-faint">
          Questions about your data or privacy? Contact{' '}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-accent hover:underline">
            {PRIVACY_CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
      </div>
    </div>
  );
}

// ── Billing & subscription (Stripe, v1.11.0) ─────────────────────────────────

/** Plan a logged-out visitor chose on /auth before signing up (client-only). */
function readPendingPlan(): { tier: Tier | null; interval: Interval | null } {
  if (typeof window === 'undefined') return { tier: null, interval: null };
  try {
    const raw = localStorage.getItem('avow:pendingPlan');
    if (raw) {
      const p = JSON.parse(raw) as { tier?: string; interval?: string };
      return {
        tier: p.tier && isTier(p.tier) ? p.tier : null,
        interval: p.interval && isInterval(p.interval) ? p.interval : null,
      };
    }
  } catch {
    /* ignore */
  }
  return { tier: null, interval: null };
}

/** Notice shown after returning from Stripe Checkout (?billing=success|cancel). */
function readBillingNotice(): string | null {
  if (typeof window === 'undefined') return null;
  const b = new URLSearchParams(window.location.search).get('billing');
  if (b === 'success') return 'Thanks — your subscription is being set up. It may take a moment to appear here.';
  if (b === 'cancel') return 'Checkout cancelled — no charge was made.';
  return null;
}

function BillingSection() {
  const { workspaceId, entitlement } = useWorkspace();
  const subscription = useQuery(api.subscriptions.getMy, { workspaceId });
  const checkout = useAction(api.stripe.createCheckoutSession);
  const portal = useAction(api.stripe.createPortalSession);

  // Read client-only state via lazy initializers (this section renders only
  // post-auth, never during SSR) so the effect below never calls setState.
  const [interval, setIntervalState] = useState<Interval>(() => readPendingPlan().interval ?? 'month');
  const [pendingTier] = useState<Tier | null>(() => readPendingPlan().tier);
  const [notice] = useState<string | null>(() => readBillingNotice());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Consume the remembered plan once we've read it into state.
    try {
      localStorage.removeItem('avow:pendingPlan');
    } catch {
      /* ignore */
    }
  }, []);

  async function subscribe(tier: Tier) {
    setBusy(true);
    setError(null);
    try {
      const { url } = await checkout({ workspaceId, tier, interval, origin: window.location.origin });
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e, 'Could not start checkout.'));
      setBusy(false);
    }
  }
  async function manage() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await portal({ workspaceId, origin: window.location.origin });
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e, 'Could not open the billing portal.'));
      setBusy(false);
    }
  }

  const live = subscription && ['active', 'trialing', 'past_due'].includes(subscription.status);
  const tierName = (id: string) => TIERS.find((t) => t.id === id)?.name ?? id;
  // This workspace has no own subscription but is covered by a member's Planner plan.
  const coveredByPlanner = !live && entitlement.tier != null && isPlannerTier(entitlement.tier);

  return (
    <section className="border border-rule rounded-xl bg-white/60 p-5">
      <h2 className="font-serif text-lg text-ink mb-3">Billing &amp; subscription</h2>
      {notice && <p className="text-xs text-emerald-700 mb-3">{notice}</p>}

      {subscription === undefined ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : live ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            You&rsquo;re on the <strong className="text-ink">{tierName(subscription.tier)}</strong> plan
            {' '}(<span className="text-ink">{subscription.status}</span>,
            billed {subscription.interval === 'year' ? 'annually' : 'monthly'}).
          </p>
          {subscription.currentPeriodEnd && (
            <p className="text-xs text-ink-faint">
              {subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'}{' '}
              on {new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}.
            </p>
          )}
          <button onClick={manage} disabled={busy} className="btn btn-primary text-sm px-4 py-2">
            {busy ? 'Opening…' : 'Manage billing'}
          </button>
        </div>
      ) : coveredByPlanner ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">
            This wedding is included in your <strong className="text-ink">Planner</strong> plan — all features are unlocked.
          </p>
          <p className="text-xs text-ink-faint">
            Manage your Planner subscription from the wedding where you set it up.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Choose a plan to start planning your wedding — your subscription begins right away.
          </p>
          <div className="flex items-center gap-3">
            <span className={`text-sm transition-colors ${interval === 'month' ? 'text-ink font-medium' : 'text-ink-soft'}`}>Monthly</span>
            <button
              type="button"
              role="switch"
              aria-checked={interval === 'year'}
              aria-label="Toggle annual billing"
              onClick={() => setIntervalState((i) => (i === 'year' ? 'month' : 'year'))}
              className={`relative w-11 h-6 rounded-full transition-colors ${interval === 'year' ? 'bg-ink' : 'bg-rule'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${interval === 'year' ? 'translate-x-5' : ''}`} />
            </button>
            <span className={`text-sm transition-colors ${interval === 'year' ? 'text-ink font-medium' : 'text-ink-soft'}`}>
              Annually <span className="text-[0.65rem] text-emerald-700">save 20%</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => subscribe(t.id)}
                disabled={busy}
                className={`border rounded-lg px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  pendingTier === t.id ? 'border-ink bg-bg-tint/40' : 'border-rule hover:border-accent'
                }`}
              >
                <div className="text-sm font-medium text-ink">{t.name}</div>
                <div className="text-xs text-ink-faint mt-0.5">Subscribe →</div>
              </button>
            ))}
          </div>

          <p className="text-[0.7rem] text-ink-faint leading-relaxed">{AUTO_RENEW_DISCLOSURE}</p>
          <p className="text-[0.7rem] text-ink-faint leading-relaxed">{REFUND_POLICY_TEXT}</p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </section>
  );
}
