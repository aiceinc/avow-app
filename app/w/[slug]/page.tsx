'use client';

/**
 * /w/{slug} — the PUBLIC wedding site render (v1.6.0).
 *
 * This route lives OUTSIDE app/(app)/layout.tsx, so it never hits the auth
 * guard, never loads the workspace context, and never renders the app shell.
 * It reads ONLY api.public.getPublicSite, which returns a whitelisted
 * projection of a *published* site (null otherwise). No authenticated data
 * can reach this page.
 */

import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { formatTime } from '@/app/lib/timeline';

/** Format an ISO "YYYY-MM-DD" without timezone drift. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const month = months[Number(m[2]) - 1] ?? '';
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

export default function PublicSitePage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  const site = useQuery(api.public.getPublicSite, { slug });

  if (site === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-sm text-ink-faint">Loading…</p>
      </div>
    );
  }

  if (site === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="text-center max-w-sm">
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-3">Avow</p>
          <h1 className="font-serif font-light text-2xl text-ink mb-2">This page isn&apos;t available</h1>
          <p className="text-sm text-ink-soft">The wedding site you&apos;re looking for doesn&apos;t exist or hasn&apos;t been published yet.</p>
        </div>
      </div>
    );
  }

  const date = formatDate(site.weddingDate);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="max-w-2xl mx-auto px-6 py-16 sm:py-24">

        {/* Hero */}
        <header className="text-center mb-14">
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-4">We&apos;re getting married</p>
          <h1 className="font-serif font-light text-4xl sm:text-5xl text-ink leading-tight">
            {site.coupleNames ?? 'Our Wedding'}
          </h1>
          {(date || site.venueName) && (
            <p className="text-sm text-ink-soft mt-5 leading-relaxed">
              {date}
              {date && site.venueName && <span className="mx-2 text-ink-faint">·</span>}
              {site.venueName}
            </p>
          )}
          {site.venueLocation && <p className="text-sm text-ink-faint mt-1">{site.venueLocation}</p>}
        </header>

        {/* Story */}
        {site.story && (
          <Section title="Welcome">
            <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{site.story}</p>
          </Section>
        )}

        {/* Schedule */}
        {site.schedule.length > 0 && (
          <Section title="Schedule">
            <ul className="space-y-3">
              {site.schedule.map((ev, i) => (
                <li key={i} className="flex gap-4">
                  <span className="text-sm font-medium text-ink tabular-nums w-24 text-right shrink-0">{formatTime(ev.time)}</span>
                  <span className="text-sm text-ink-soft">
                    {ev.title}
                    {ev.location && <span className="text-ink-faint"> · {ev.location}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Travel */}
        {site.travelNotes && (
          <Section title="Travel & stay">
            <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{site.travelNotes}</p>
          </Section>
        )}

        <footer className="mt-16 pt-8 border-t border-rule text-center">
          <p className="text-xs text-ink-faint tracking-wide">Made with Avow</p>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-4 text-center">{title}</h2>
      <div className="max-w-prose mx-auto">{children}</div>
    </section>
  );
}
