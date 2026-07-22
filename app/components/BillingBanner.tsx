'use client';

/**
 * BillingBanner — the slim shell-wide billing notice, rendered just below the
 * module tabs on every authed page. Surfaces exactly one of:
 *   - locked:    no subscription → read-only paywall / start-trial prompt.
 *   - past_due:  a payment failed → update-your-card prompt.
 *   - trialing:  free trial running → days-left countdown.
 * Renders nothing for an active paid subscription or while loading.
 *
 * Actions route to /account, where the subscribe / manage-billing controls live.
 */

import Link from 'next/link';
import type { Entitlement } from '@/app/components/WorkspaceContext';

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export default function BillingBanner({ entitlement }: { entitlement: Entitlement }) {
  const { status, trialDaysLeft, trialEligible, cancelAtPeriodEnd, trialEnd, currentPeriodEnd } =
    entitlement;

  if (status === 'locked') {
    // Anyone who hasn't used their one free trial gets the trial CTA; everyone
    // else (already trialled) is asked to pick a plan.
    return trialEligible ? (
      <Bar tone="locked">
        <span>
          <strong>Start your free trial to begin planning.</strong> Your wedding is read-only until then.
        </span>
        <Action label="Start free trial" />
      </Bar>
    ) : (
      <Bar tone="locked">
        <span>
          <strong>Subscribe to start planning.</strong> Your wedding is read-only until you choose a plan.
        </span>
        <Action label="See plans" />
      </Bar>
    );
  }

  if (status === 'past_due') {
    return (
      <Bar tone="warn">
        <span>
          <strong>Your last payment didn&rsquo;t go through.</strong> Update your card to
          keep your subscription active.
        </span>
        <Action label="Update payment" />
      </Bar>
    );
  }

  if (status === 'trialing') {
    const days = trialDaysLeft ?? 0;
    const left =
      days === 0 ? 'Your free trial ends today.' : `${days} day${days === 1 ? '' : 's'} left in your free trial.`;
    // Cancelled during the trial: it will NOT convert. Access continues to the
    // end of the trial, then the wedding becomes read-only.
    if (cancelAtPeriodEnd) {
      return (
        <Bar tone="warn">
          <span>
            <strong>{left}</strong> You&rsquo;ve cancelled, so your plan won&rsquo;t start
            {trialEnd ? ` on ${fmtDate(trialEnd)}` : ''} — your wedding becomes read-only after that.
          </span>
          <Action label="Resume plan" />
        </Bar>
      );
    }
    return (
      <Bar tone="info">
        <span>
          <strong>{left}</strong>{' '}
          Your plan starts automatically when it ends — cancel any time before then.
        </span>
        <Action label="Manage plan" />
      </Bar>
    );
  }

  // Paid and cancelled: still active until the period ends, then read-only.
  if (status === 'active' && cancelAtPeriodEnd) {
    return (
      <Bar tone="warn">
        <span>
          <strong>Your plan is cancelled.</strong> You keep access
          {currentPeriodEnd ? ` until ${fmtDate(currentPeriodEnd)}` : ' until the end of this billing period'},
          then your wedding becomes read-only.
        </span>
        <Action label="Resume plan" />
      </Bar>
    );
  }

  return null;
}

function Action({ label }: { label: string }) {
  return (
    <Link
      href="/account"
      className="shrink-0 underline underline-offset-2 font-medium hover:opacity-80 transition-opacity"
    >
      {label} →
    </Link>
  );
}

function Bar({
  tone,
  children,
}: {
  tone: 'locked' | 'warn' | 'info';
  children: React.ReactNode;
}) {
  const palette =
    tone === 'locked'
      ? 'bg-red-600 text-white'
      : tone === 'warn'
        ? 'bg-amber-500 text-ink'
        : 'bg-ink text-bg';
  return (
    <div
      className={`${palette} px-6 sm:px-10 py-2 text-xs sm:text-[0.8rem] flex items-center justify-between gap-4 shrink-0`}
    >
      {children}
    </div>
  );
}
