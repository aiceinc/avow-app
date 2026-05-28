import { redirect } from 'next/navigation';

/**
 * Root route. The app is multi-module now; Guest List is the default landing
 * (the natural first step in planning). Auth + workspace gating happens in the
 * (app) shell layout that wraps /guests.
 */
export default function RootPage() {
  redirect('/guests');
}
