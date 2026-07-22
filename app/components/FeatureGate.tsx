'use client';

/**
 * FeatureGate (v1.12.0) — wraps a premium module (seating / timeline / vendors)
 * and renders its children only when the active workspace's tier includes that
 * feature. Otherwise it shows a start-trial / upgrade panel instead, so couples
 * without access don't land on an editor that errors on every action. The real
 * enforcement is server-side (convex/lib.ts assertTierFeature) — this is the
 * matching UI.
 */

import Link from 'next/link';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { tierHasFeature, FEATURE_LABEL, type Feature } from '@/convex/billingConfig';

export default function FeatureGate({
  feature,
  children,
}: {
  feature: Feature;
  children: React.ReactNode;
}) {
  const { entitlement } = useWorkspace();
  const { tier, status, trialEligible } = entitlement;

  // Don't flash the gate before entitlement loads.
  if (status === 'loading') return <>{children}</>;

  if (tier != null && tierHasFeature(tier, feature)) return <>{children}</>;

  const locked = status === 'locked' || tier == null;
  const label = FEATURE_LABEL[feature];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-md mx-auto w-full px-6 py-20 sm:py-28 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-bg-tint text-ink-soft mb-5" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="font-serif text-2xl text-ink mb-2">{label}</h2>
        {locked ? (
          <p className="text-sm text-ink-soft leading-relaxed mb-6">
            {trialEligible
              ? `Start your free trial to unlock ${label.toLowerCase()} and begin planning your wedding.`
              : `Subscribe to unlock ${label.toLowerCase()} and start planning your wedding.`}
          </p>
        ) : (
          <p className="text-sm text-ink-soft leading-relaxed mb-6">
            {label} isn&rsquo;t included on your current plan. Upgrade to unlock it.
          </p>
        )}
        <Link href="/account" className="btn btn-primary text-sm px-6 py-3 inline-block">
          {locked ? (trialEligible ? 'Start free trial' : 'See plans') : 'Upgrade'}
        </Link>
      </div>
    </div>
  );
}
