'use client';

/**
 * /account — account settings (v1.9.0).
 *
 * Shows the signed-in user's identity and the irreversible "Delete my account
 * and data" capability (data-subject erasure). Deletion runs the
 * account.deleteMyAccount mutation, then signs out and returns to /auth. Guarded
 * by a type-to-confirm step because it is destructive and cannot be undone.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@/convex/_generated/api';
import { PRIVACY_CONTACT_EMAIL } from '@/app/lib/config';

export default function AccountPage() {
  const me = useQuery(api.workspaces.getMyUserId);
  const deleteMyAccount = useMutation(api.account.deleteMyAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount({});
      // The mutation deleted our sessions; clear the client token and leave.
      await signOut().catch(() => {});
      router.replace('/auth');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
      setDeleting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
        <h1 className="font-serif text-2xl text-ink">Account</h1>

        {/* Identity */}
        <section className="border border-rule rounded-xl bg-white/60 p-5">
          <h2 className="font-serif text-lg text-ink mb-3">Your details</h2>
          {me === undefined ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : me === null ? (
            <p className="text-sm text-ink-faint">Not signed in.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-20 text-ink-faint shrink-0">Name</dt>
                <dd className="text-ink">{me.name || <span className="text-ink-faint">—</span>}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 text-ink-faint shrink-0">Email</dt>
                <dd className="text-ink">{me.email || <span className="text-ink-faint">—</span>}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* Danger zone — delete account + data */}
        <section className="border border-red-200 rounded-xl bg-red-50/40 p-5">
          <h2 className="font-serif text-lg text-ink mb-1">Delete account &amp; data</h2>
          <p className="text-sm text-ink-soft leading-relaxed mb-2">
            Permanently delete your account and your wedding planning data — guests, seating,
            budget, vendors, timeline, and your wedding website. <strong>This can&apos;t be undone.</strong>
          </p>
          <p className="text-xs text-ink-faint leading-relaxed mb-4">
            If you share a wedding with a partner, your account is removed but the wedding&apos;s data
            stays with them. A wedding with no remaining members is deleted entirely.
          </p>

          {!confirming ? (
            <button
              onClick={() => { setConfirming(true); setError(null); }}
              className="btn text-sm px-4 py-2 bg-red-600 text-white border-red-600 hover:bg-red-700"
            >
              Delete my account and data
            </button>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-ink-soft">
                Type <span className="font-mono text-ink">DELETE</span> to confirm
              </label>
              <input
                autoFocus
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="app-input w-full max-w-xs text-sm px-3 py-2.5"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={!canDelete || deleting}
                  className="btn text-sm px-4 py-2 bg-red-600 text-white border-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600"
                >
                  {deleting ? 'Deleting…' : 'Permanently delete'}
                </button>
                <button
                  onClick={() => { setConfirming(false); setConfirmText(''); setError(null); }}
                  disabled={deleting}
                  className="btn btn-secondary text-sm px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </section>

        {/* Privacy contact */}
        <p className="text-xs text-ink-faint">
          Questions about your data or privacy? Contact{' '}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-accent hover:underline">
            {PRIVACY_CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
