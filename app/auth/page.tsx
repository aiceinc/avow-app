'use client';

import { useState, FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import Wordmark from '../components/Wordmark';
import AppFooter from '../components/AppFooter';

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
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-rule w-full max-w-sm p-8 animate-fade-in">

          {/* Logo */}
          <div className="text-center mb-8">
            <Wordmark className="text-3xl" />
            <p className="text-sm text-ink-faint mt-1.5">Seating Planner</p>
          </div>

          {/* Tab switcher */}
          <div className="flex border border-rule rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => { setFlow('signIn'); setError(null); }}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
                flow === 'signIn'
                  ? 'bg-ink text-bg'
                  : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setFlow('signUp'); setError(null); }}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${
                flow === 'signUp'
                  ? 'bg-ink text-bg'
                  : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="app-input w-full text-sm px-3 py-2.5"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                className="app-input w-full text-sm px-3 py-2.5"
              />
              {flow === 'signUp' && (
                <p className="text-xs text-ink-faint mt-1">At least 8 characters.</p>
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
              className="btn btn-primary w-full text-sm py-2.5"
            >
              {loading
                ? 'Please wait…'
                : flow === 'signIn' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
