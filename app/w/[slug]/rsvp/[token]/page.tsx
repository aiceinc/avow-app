'use client';

/**
 * /w/{slug}/rsvp/{token} — PUBLIC, token-gated RSVP (v1.6.0).
 *
 * Outside the auth guard. The token is the auth: it resolves (via
 * api.public.getInvite) to exactly one guest, and the form submits through
 * api.public.submitRsvp, which updates ONLY that guest's own RSVP fields.
 * An invalid token shows a clean error with no data leak.
 */

import { useState, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { errorMessage } from '@/app/lib/errors';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

export default function RsvpPage() {
  const params = useParams();
  const token = String(params.token ?? '');
  const invite = useQuery(api.public.getInvite, { token });
  const submit = useMutation(api.public.submitRsvp);

  const [attending, setAttending] = useState<'yes' | 'no' | null>(null);
  const [plusOneName, setPlusOneName] = useState('');
  const [dietary, setDietary] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form from the guest's existing values once the invite loads.
  if (invite && !seeded) {
    if (invite.rsvpStatus === 'yes' || invite.rsvpStatus === 'no') setAttending(invite.rsvpStatus);
    setPlusOneName(invite.plusOneName ?? '');
    setDietary(invite.dietaryNotes ?? '');
    setSeeded(true);
  }

  if (invite === undefined) {
    return <Centered><p className="text-sm text-ink-faint">Loading…</p></Centered>;
  }

  if (invite === null) {
    return (
      <Centered>
        <div className="text-center max-w-sm">
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-3">Avow</p>
          <h1 className="font-serif font-light text-2xl text-ink mb-2">This invite link isn&apos;t valid</h1>
          <p className="text-sm text-ink-soft">Please double-check the link from your invitation, or ask the couple to resend it.</p>
        </div>
      </Centered>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!attending) { setError('Please let us know if you can make it.'); return; }
    setSaving(true);
    setError(null);
    try {
      await submit({
        token,
        rsvpStatus: attending,
        plusOneName: invite!.hasPlusOne ? plusOneName : undefined,
        dietaryNotes: dietary,
      });
      setDone(true);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not submit your RSVP.'));
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Centered>
        <div className="text-center max-w-sm animate-fade-in">
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-3">Thank you</p>
          <h1 className="font-serif font-light text-2xl text-ink mb-2">Your RSVP is in</h1>
          <p className="text-sm text-ink-soft">
            {attending === 'yes' ? "We can't wait to celebrate with you!" : "Thank you for letting us know — you'll be missed."}
          </p>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-rule p-8 animate-fade-in">
        <div className="text-center mb-6">
          {invite.site.coupleNames && (
            <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-2">{invite.site.coupleNames}</p>
          )}
          <h1 className="font-serif text-2xl text-ink">Hi {invite.name} —</h1>
          <p className="text-sm text-ink-soft mt-1">Will you be joining us?</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Attending */}
          <div className="flex gap-2">
            {(['yes', 'no'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAttending(opt)}
                className={`flex-1 text-sm py-2.5 rounded-lg border transition-colors ${
                  attending === opt ? 'bg-ink text-bg border-ink' : 'border-rule text-ink-soft hover:border-accent'
                }`}
              >
                {opt === 'yes' ? 'Joyfully accept' : 'Regretfully decline'}
              </button>
            ))}
          </div>

          {/* Plus-one (only if their record allows it) */}
          {invite.hasPlusOne && attending === 'yes' && (
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Your plus-one&apos;s name <span className="text-ink-faint font-normal">(optional)</span></label>
              <input type="text" value={plusOneName} onChange={(e) => setPlusOneName(e.target.value)} placeholder="Guest name" className="app-input w-full text-sm px-3 py-2.5" />
            </div>
          )}

          {/* Dietary */}
          {attending === 'yes' && (
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Dietary notes <span className="text-ink-faint font-normal">(optional)</span></label>
              <input type="text" value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="e.g. vegetarian, nut allergy" className="app-input w-full text-sm px-3 py-2.5" />
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button type="submit" disabled={saving} className="btn btn-primary w-full text-sm py-2.5">
            {saving ? 'Sending…' : 'Send RSVP'}
          </button>
        </form>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-bg px-6">{children}</div>;
}
