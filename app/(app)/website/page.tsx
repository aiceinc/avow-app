'use client';

/**
 * /website — the Wedding Website module (v1.6.0), internal editor.
 *
 * The couple edits their public mini-site here: core content, the public URL +
 * publish toggle, which timeline moments to surface publicly, and RSVP
 * management (status + per-guest invitation links). The public render lives
 * outside the auth guard at /w/{slug} (app/w/[slug]/page.tsx) and reads only a
 * whitelisted projection via convex/public.ts.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { errorMessage } from '@/app/lib/errors';
import { api } from '@/convex/_generated/api';
import { Doc, Id } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { formatTime } from '@/app/lib/timeline';
import { rsvpStatusOf, rsvpStyle } from '@/app/lib/guests';

export default function WebsitePage() {
  const { workspaceId, entitlement } = useWorkspace();
  const canEdit = entitlement.canEdit;

  const site    = useQuery(api.weddingSite.get,    { workspaceId });
  const items   = useQuery(api.timeline.listItems, { workspaceId }) ?? [];
  const guests  = useQuery(api.guests.list,        { workspaceId }) ?? [];

  const initSite      = useMutation(api.weddingSite.initSite);
  const updateContent = useMutation(api.weddingSite.updateContent);
  const setSlug       = useMutation(api.weddingSite.setSlug);
  const setPublished  = useMutation(api.weddingSite.setPublished);
  const updateItem    = useMutation(api.timeline.updateItem);
  const ensureToken   = useMutation(api.weddingSite.ensureGuestToken);

  // Create the site row on first visit (idempotent server-side too).
  const initRef = useRef(false);
  useEffect(() => {
    if (site === null && !initRef.current) {
      initRef.current = true;
      initSite({ workspaceId });
    }
  }, [site, workspaceId, initSite]);

  if (site === undefined) {
    return <div className="flex-1 overflow-y-auto"><p className="text-sm text-ink-faint py-16 text-center">Loading…</p></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-6">
        <h1 className="font-serif text-2xl text-ink">Wedding Website</h1>

        {site === null ? (
          <p className="text-sm text-ink-faint py-12 text-center">Setting up your site…</p>
        ) : (
          <>
            <PublishCard site={site} canEdit={canEdit} onSetSlug={(slug) => setSlug({ workspaceId, slug })} onSetPublished={(p) => setPublished({ workspaceId, published: p })} />
            <ContentCard site={site} canEdit={canEdit} onSave={(values) => updateContent({ workspaceId, ...values })} />
            <ScheduleCard items={items} onToggle={(itemId, isPublic) => updateItem({ itemId, isPublic })} />
            <RsvpCard guests={guests} slug={site.slug} onEnsureToken={(guestId) => ensureToken({ guestId })} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Publish + slug ──────────────────────────────────────────────────────────

function PublishCard({
  site,
  canEdit,
  onSetSlug,
  onSetPublished,
}: {
  site: Doc<'weddingSites'>;
  canEdit: boolean;
  onSetSlug: (slug: string) => Promise<string>;
  onSetPublished: (published: boolean) => Promise<unknown>;
}) {
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugInput, setSlugInput] = useState(site.slug);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${origin}/w/${site.slug}`;

  async function saveSlug() {
    setError(null);
    try {
      await onSetSlug(slugInput);
      setEditingSlug(false);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save the address.'));
    }
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="border border-rule rounded-xl bg-white/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${site.published ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <span className="text-sm font-medium text-ink">{site.published ? 'Published' : 'Draft — not visible yet'}</span>
        </div>
        <button
          onClick={() => onSetPublished(!site.published)}
          disabled={!canEdit}
          className={`btn text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${site.published ? 'btn-secondary' : 'btn-primary'}`}
        >
          {site.published ? 'Unpublish' : 'Publish'}
        </button>
      </div>

      {/* Public address */}
      <div className="text-xs text-ink-soft mb-1">Public address</div>
      {editingSlug ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-faint">/w/</span>
          <input
            autoFocus
            type="text"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveSlug(); if (e.key === 'Escape') { setEditingSlug(false); setSlugInput(site.slug); setError(null); } }}
            className="app-input text-sm px-3 py-1.5 flex-1"
          />
          <button onClick={saveSlug} className="btn btn-primary text-xs px-3 py-1.5">Save</button>
          <button onClick={() => { setEditingSlug(false); setSlugInput(site.slug); setError(null); }} className="btn btn-secondary text-xs px-3 py-1.5">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm text-ink bg-bg-tint px-2 py-1 rounded">{publicUrl}</code>
          {site.published && (
            <button onClick={copyUrl} className="text-xs text-ink-faint hover:text-ink transition-colors">{copied ? 'Copied!' : 'Copy'}</button>
          )}
          {canEdit && (
            <button onClick={() => { setSlugInput(site.slug); setEditingSlug(true); }} className="text-xs text-ink-faint hover:text-ink-soft transition-colors">Edit address</button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </section>
  );
}

// ── Content fields ────────────────────────────────────────────────────────────

type ContentValues = {
  coupleNames: string;
  weddingDate: string;
  venueName: string;
  venueLocation: string;
  story: string;
  travelNotes: string;
};

function ContentCard({
  site,
  canEdit,
  onSave,
}: {
  site: Doc<'weddingSites'>;
  canEdit: boolean;
  onSave: (values: ContentValues) => Promise<unknown>;
}) {
  const [v, setV] = useState<ContentValues>({
    coupleNames: site.coupleNames ?? '',
    weddingDate: site.weddingDate ?? '',
    venueName: site.venueName ?? '',
    venueLocation: site.venueLocation ?? '',
    story: site.story ?? '',
    travelNotes: site.travelNotes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof ContentValues>(k: K, val: string) {
    setV((prev) => ({ ...prev, [k]: val }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await onSave(v);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <section className="border border-rule rounded-xl bg-white/60 p-5 space-y-4">
      <h2 className="font-serif text-lg text-ink">Site content</h2>

      <Field label="Couple names">
        <input type="text" value={v.coupleNames} onChange={(e) => set('coupleNames', e.target.value)} placeholder="e.g. Alex & Jordan" className="app-input w-full text-sm px-3 py-2.5" />
      </Field>

      <div className="flex gap-3">
        <Field label="Wedding date" className="w-44">
          <input type="date" value={v.weddingDate} onChange={(e) => set('weddingDate', e.target.value)} className="app-input w-full text-sm px-3 py-2.5 tabular-nums" />
        </Field>
        <Field label="Venue" className="flex-1">
          <input type="text" value={v.venueName} onChange={(e) => set('venueName', e.target.value)} placeholder="e.g. Greenhouse Gardens" className="app-input w-full text-sm px-3 py-2.5" />
        </Field>
      </div>

      <Field label="Venue location">
        <input type="text" value={v.venueLocation} onChange={(e) => set('venueLocation', e.target.value)} placeholder="e.g. 120 Garden Way, Portland OR" className="app-input w-full text-sm px-3 py-2.5" />
      </Field>

      <Field label="Welcome / your story">
        <textarea value={v.story} onChange={(e) => set('story', e.target.value)} rows={3} placeholder="A short welcome for your guests…" className="app-input w-full text-sm px-3 py-2.5 resize-y" />
      </Field>

      <Field label="Travel & accommodation">
        <textarea value={v.travelNotes} onChange={(e) => set('travelNotes', e.target.value)} rows={3} placeholder="Hotels, parking, getting there…" className="app-input w-full text-sm px-3 py-2.5 resize-y" />
      </Field>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !canEdit} className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving…' : 'Save content'}</button>
        {saved && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-ink-soft mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── Schedule curation ─────────────────────────────────────────────────────────

function ScheduleCard({
  items,
  onToggle,
}: {
  items: Doc<'timelineItems'>[];
  onToggle: (itemId: Id<'timelineItems'>, isPublic: boolean) => Promise<unknown>;
}) {
  const sorted = [...items].sort((a, b) => a.time - b.time);
  const publicCount = items.filter((i) => i.isPublic).length;

  return (
    <section className="border border-rule rounded-xl bg-white/60 p-5">
      <h2 className="font-serif text-lg text-ink mb-1">Public schedule</h2>
      <p className="text-xs text-ink-faint mb-3">
        Choose which Day-of Timeline moments guests see. Only the time, title, and location are shown publicly — never vendors, owners, or notes. {publicCount} shown.
      </p>

      {sorted.length === 0 ? (
        <p className="text-sm text-ink-faint py-4">No timeline events yet — add them in the Day-of Timeline tab.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {sorted.map((item) => (
            <li key={item._id} className="flex items-center gap-3 py-2.5">
              <span className="text-xs font-medium text-ink tabular-nums w-20 text-right shrink-0">{formatTime(item.time)}</span>
              <span className="text-sm text-ink flex-1 truncate">{item.title}</span>
              <label className="flex items-center gap-1.5 text-xs text-ink-soft shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.isPublic === true}
                  onChange={(e) => onToggle(item._id, e.target.checked)}
                  className="accent-accent"
                />
                Show on site
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── RSVP management ────────────────────────────────────────────────────────────

function RsvpCard({
  guests,
  slug,
  onEnsureToken,
}: {
  guests: Doc<'guests'>[];
  slug: string;
  onEnsureToken: (guestId: Id<'guests'>) => Promise<string>;
}) {
  const responded = guests.filter((g) => rsvpStatusOf(g) !== 'pending').length;

  return (
    <section className="border border-rule rounded-xl bg-white/60 p-5">
      <h2 className="font-serif text-lg text-ink mb-1">RSVPs</h2>
      <p className="text-xs text-ink-faint mb-3">
        {guests.length} guest{guests.length !== 1 ? 's' : ''} · {responded} responded. Share each guest&apos;s personal invite link — RSVPs update their guest record directly.
      </p>

      {guests.length === 0 ? (
        <p className="text-sm text-ink-faint py-4">No guests yet — add them in the Guest List tab.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {guests.map((g) => (
            <RsvpRow key={g._id} guest={g} slug={slug} onEnsureToken={onEnsureToken} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RsvpRow({
  guest,
  slug,
  onEnsureToken,
}: {
  guest: Doc<'guests'>;
  slug: string;
  onEnsureToken: (guestId: Id<'guests'>) => Promise<string>;
}) {
  const [copied, setCopied] = useState(false);
  const rsvp = rsvpStyle(rsvpStatusOf(guest));

  async function copyLink() {
    const token = await onEnsureToken(guest._id);
    const url = `${window.location.origin}/w/${slug}/rsvp/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="text-sm text-ink flex-1 truncate">{guest.name}</span>
      <span className={`flex items-center gap-1.5 text-xs shrink-0 w-20 ${rsvp.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${rsvp.dot}`} />
        {rsvp.label}
      </span>
      <button onClick={copyLink} className="text-xs text-ink-faint hover:text-ink transition-colors shrink-0">
        {copied ? 'Copied!' : 'Copy invite link'}
      </button>
    </li>
  );
}
