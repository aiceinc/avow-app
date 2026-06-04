'use client';

/**
 * ModuleTabs — horizontal module navigation, persistent across all routes in
 * the (app) layout. The active tab is derived from the route segment one level
 * below the layout (useSelectedLayoutSegment), highlighted with the gold accent.
 *
 * Pro-only modules (seating / timeline / vendors) show a small lock when the
 * workspace's tier doesn't include them (v1.12.0); clicking still navigates —
 * the page itself shows the upgrade panel (FeatureGate).
 */

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { tierHasFeature, type Feature } from '@/convex/billingConfig';

const TABS: { segment: string; href: string; label: string; feature?: Feature }[] = [
  { segment: 'home',     href: '/home',     label: 'Home' },
  { segment: 'guests',   href: '/guests',   label: 'Guest List' },
  { segment: 'seating',  href: '/seating',  label: 'Seating Planner', feature: 'seating' },
  { segment: 'vendors',  href: '/vendors',  label: 'Vendors', feature: 'vendors' },
  { segment: 'budget',   href: '/budget',   label: 'Budget' },
  { segment: 'timeline', href: '/timeline', label: 'Day-of Timeline', feature: 'timeline' },
  { segment: 'website',  href: '/website',  label: 'Wedding Website' },
];

function LockIcon() {
  return (
    <svg className="inline-block ml-1.5 -mt-px opacity-70" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function ModuleTabs() {
  const segment = useSelectedLayoutSegment();
  const { entitlement } = useWorkspace();
  const { tier } = entitlement;

  return (
    <nav className="border-b border-rule bg-bg/80 backdrop-blur-sm shrink-0 overflow-x-auto">
      <ul className="flex items-center gap-1 px-3">
        {TABS.map(tab => {
          const active = segment === tab.segment;
          const gated = !!tab.feature && tier != null && !tierHasFeature(tier, tab.feature);
          return (
            <li key={tab.segment}>
              <Link
                href={tab.href}
                title={gated ? `${tab.label} — Pro plan` : undefined}
                className={`inline-block whitespace-nowrap px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-accent text-ink font-medium'
                    : 'border-transparent text-ink-faint hover:text-ink-soft'
                }`}
              >
                {tab.label}
                {gated && <LockIcon />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
