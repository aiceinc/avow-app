'use client';

/**
 * /invite?code=XXXXXXXX — workspace invite acceptance page
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { errorMessage } from '@/app/lib/errors';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import AppFooter from '../components/AppFooter';

// useSearchParams requires a Suspense boundary in Next.js App Router
export default function InvitePage() {
  return (
    <Suspense fallback={<Centered>Loading…</Centered>}>
      <InviteFlow />
    </Suspense>
  );
}

function InviteFlow() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const joinByInviteCode = useMutation(api.workspaces.joinByInviteCode);
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code') ?? '';

  // The no-code error is knowable at render time; the join failure is set in the
  // promise callback (not synchronously in the effect). A ref guards against
  // re-joining if the effect re-runs.
  const [errorMsg, setErrorMsg] = useState(() => (code ? '' : 'No invite code in the URL.'));
  const joinedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !code || joinedRef.current) return;
    if (!isAuthenticated) {
      router.push(`/auth?redirect=/invite?code=${encodeURIComponent(code)}`);
      return;
    }
    joinedRef.current = true;
    joinByInviteCode({ inviteCode: code })
      .then(() => router.push('/'))
      .catch((err: unknown) => setErrorMsg(errorMessage(err, 'Could not join this wedding.')));
  }, [isAuthenticated, isLoading, code, joinByInviteCode, router]);

  if (errorMsg) {
    return (
      <Centered>
        <p className="text-red-600 text-sm mb-4">{errorMsg}</p>
        <button
          onClick={() => router.push('/')}
          className="text-sm text-ink-faint hover:text-ink-soft underline transition-colors"
        >
          Go to app
        </button>
      </Centered>
    );
  }
  if (isLoading || !isAuthenticated) return <Centered>Checking invite…</Centered>;
  return <Centered>Joining workspace…</Centered>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-ink-soft text-sm">
        {children}
      </div>
      <AppFooter />
    </div>
  );
}
