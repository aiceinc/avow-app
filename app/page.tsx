import { redirect } from 'next/navigation';

/**
 * Root route. As of v1.7.0 the post-login landing is the Home / Overview
 * dashboard (the app's front door across all six modules). Auth + workspace
 * gating happens in the (app) shell layout that wraps /home and every module.
 */
export default function RootPage() {
  redirect('/home');
}
