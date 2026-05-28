'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';

// Initialise the Convex client once — reused across all components.
// NEXT_PUBLIC_CONVEX_URL is written to .env.local by `npx convex dev`.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: React.ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
