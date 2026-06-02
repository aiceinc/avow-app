'use client';

/**
 * BillingBanner (v1.11.1) — the slim shell-wide billing notice, rendered just
 * below the module tabs on every authed page. Surfaces exactly one of:
 *   - locked:     free trial ended, no subscription → read-only paywall prompt.
 *   - past_due:   a payment failed → update-your-card prompt.
 *   - trial:      free-trial countdown nudge ("ends in N days").
 * Renders nothing for an active subscription or while loading.
 *
 * Actions route to /account, where the subscribe / manage-billing controls live.
 */

import Link from 'next/link';
import type { Entitlement } from '@/app/components/WorkspaceContext';

export default function BillingBanner({ entitlement }: { entitlement: Entitlement }) {
  const { status, trialDaysLeft } = entitlement;

  if (status === 'locked') {
    return (
      <Bar tone="locked">
        <span>
          <strong>Your free trial has ended.</strong> Your wedding is now read-only —
          subscribe to keep editing.
        </span>
        <Action label="Subscribe" />
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

  if (status === 'trial') {
    const n = trialDaysLeft;
    const urgent = n <= 3;
    return (
      <Bar tone={urgent ? 'warn' : 'trial'}>
        <span>
          Free trial — <strong>{n === 0 ? 'ends today' : `${n} day${n === 1 ? '' : 's'} left`}</strong>.
          {' '}Subscribe any time to keep your planning after it ends.
        </span>
        <Action label="See plans" />
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
  tone: 'locked' | 'warn' | 'trial';
  children: React.ReactNode;
}) {
  const palette =
    tone === 'locked'
      ? 'bg-red-600 text-white'
      : tone === 'warn'
      ? 'bg-amber-500 text-ink'
      : 'bg-bg-tint text-ink-soft';
  return (
    <div
      className={`${palette} px-6 sm:px-10 py-2 text-xs sm:text-[0.8rem] flex items-center justify-between gap-4 shrink-0`}
    >
      {children}
    </div>
  );
}
