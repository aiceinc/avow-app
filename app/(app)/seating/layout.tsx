'use client';

import FeatureGate from '@/app/components/FeatureGate';

/** Gate the Seating Planner behind the Pro plan (v1.12.0). */
export default function SeatingLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="seating" bypassForDemo>{children}</FeatureGate>;
}
