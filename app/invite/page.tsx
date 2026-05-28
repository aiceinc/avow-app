'use client';

/**
 * /invite?code=XXXXXXXX — workspace invite acceptance page
 */

import { Suspense, useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/convex/_generated/api';

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

  const [status, setStatus] = useState<'pending' | 'joining' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(`/auth?redirect=/invite?code=${encodeURIComponent(code)}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMsg('No invite code in the URL.');
      return;
    }

    setStatus('joining');
    joinByInviteCode({ inviteCode: code })
      .then(() => router.push('/'))
      .catch((err: Error) => {
        setStatus('error');
        setErrorMsg(err.message);
      });
  }, [isAuthenticated, isLoading, code]);

  if (isLoading || status === 'pending') return <Centered>Checking invite…</Centered>;
  if (status === 'joining')             return <Centered>Joining workspace…</Centered>;

  return (
    <Centered>
      <p className="text-red-600 text-sm mb-4">{errorMsg}</p>
      <button
        onClick={() => router.push('/')}
        className="text-sm text-gray-500 underline"
      >
        Go to app
      </button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-4 text-gray-600 text-sm">
      {children}
    </div>
  );
}
