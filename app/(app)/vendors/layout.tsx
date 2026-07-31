'use client';

import FeatureGate from '@/app/components/FeatureGate';

/** Gate the Vendors module behind the Pro plan (v1.12.0). */
export default function VendorsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="vendors" bypassForDemo>{children}</FeatureGate>;
}
