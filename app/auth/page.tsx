'use client';

import { useState, FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';

type Flow = 'signIn' | 'signUp';

/** Map raw Convex Auth error messages to user-friendly strings. */
function friendlyError(raw: string, flow: Flow): string {
  const msg = raw.toLowerCase();

  if (msg.includes('invalid password') || msg.includes('passwordtoosmall')) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (msg.includes('no account') || msg.includes('not found') || msg.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }
  if (msg.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  // Fall back to a generic message — never show the raw Convex error
  return flow === 'signIn'
    ? 'Sign-in failed. Check your email and password and try again.'
    : 'Could not create account. Please try again.';
}

export default function AuthPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();

  const [flow, setFlow]         = useState<Flow>('signIn');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn('password', { email, password, flow });
      router.push('/');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(friendlyError(raw, flow));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-semibold text-gray-900">Avow</span>
          <p className="text-sm text-gray-500 mt-1">Seating Planner</p>
        </div>

        {/* Tab switcher */}
        <div className="flex border border-gray-200 rounded-lg p-1 mb-6">
          <button
            type="button"
            onClick={() => { setFlow('signIn'); setError(null); }}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
              flow === 'signIn'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setFlow('signUp'); setError(null); }}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
              flow === 'signUp'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
            {flow === 'signUp' && (
              <p className="text-xs text-gray-400 mt-1">At least 8 characters.</p>
            )}
          </div>

          {/* Error message — clean, compact */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="mt-px shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-sm py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading
              ? 'Please wait…'
              : flow === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
