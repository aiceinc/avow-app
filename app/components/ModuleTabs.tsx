'use client';

/**
 * ModuleTabs — horizontal module navigation, persistent across all routes in
 * the (app) layout. The active tab is derived from the route segment one level
 * below the layout (useSelectedLayoutSegment), highlighted with the gold accent.
 */

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

const TABS: { segment: string; href: string; label: string }[] = [
  { segment: 'guests',   href: '/guests',   label: 'Guest List' },
  { segment: 'seating',  href: '/seating',  label: 'Seating Planner' },
  { segment: 'vendors',  href: '/vendors',  label: 'Vendors' },
  { segment: 'budget',   href: '/budget',   label: 'Budget' },
  { segment: 'website',  href: '/website',  label: 'Wedding Website' },
  { segment: 'timeline', href: '/timeline', label: 'Day-of Timeline' },
];

export default function ModuleTabs() {
  const segment = useSelectedLayoutSegment();

  return (
    <nav className="border-b border-rule bg-bg/80 backdrop-blur-sm shrink-0 overflow-x-auto">
      <ul className="flex items-center gap-1 px-3">
        {TABS.map(tab => {
          const active = segment === tab.segment;
          return (
            <li key={tab.segment}>
              <Link
                href={tab.href}
                className={`inline-block whitespace-nowrap px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-accent text-ink font-medium'
                    : 'border-transparent text-ink-faint hover:text-ink-soft'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
