'use client';

import FeatureGate from '@/app/components/FeatureGate';

/** Gate the Day-of Timeline behind the Pro plan (v1.12.0). */
export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="timeline">{children}</FeatureGate>;
}
