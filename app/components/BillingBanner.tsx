'use client';

/**
 * BillingBanner — the slim shell-wide billing notice, rendered just below the
 * module tabs on every authed page. Surfaces exactly one of:
 *   - locked:    no subscription → read-only paywall prompt (there is no trial).
 *   - past_due:  a payment failed → update-your-card prompt.
 * Renders nothing for an active subscription or while loading.
 *
 * Actions route to /account, where the subscribe / manage-billing controls live.
 */

import Link from 'next/link';
import type { Entitlement } from '@/app/components/WorkspaceContext';

export default function BillingBanner({ entitlement }: { entitlement: Entitlement }) {
  const { status } = entitlement;

  if (status === 'locked') {
    return (
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
  tone: 'locked' | 'warn';
  children: React.ReactNode;
}) {
  const palette = tone === 'locked' ? 'bg-red-600 text-white' : 'bg-amber-500 text-ink';
  return (
    <div
      className={`${palette} px-6 sm:px-10 py-2 text-xs sm:text-[0.8rem] flex items-center justify-between gap-4 shrink-0`}
    >
      {children}
    </div>
  );
}
