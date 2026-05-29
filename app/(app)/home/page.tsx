'use client';

/**
 * /home — the Home / Overview dashboard (v1.7.0), the post-login landing route
 * and first nav tab.
 *
 * A read-mostly aggregate view across all six modules for the active workspace:
 * a wedding-day countdown hero plus glanceable summary cards (guests, budget,
 * vendors, timeline, website), each linking into its full module with a sensible
 * empty state. It writes nothing of its own — the only mutation is a trivial
 * single-field "quick add guest" that reuses the existing guests.create mutation
 * (side defaults to "both", RSVP to "pending", exactly like the guest modal).
 *
 * No new Convex queries: every card reads an existing module query and derives
 * its summary on the client (the lists are bounded and small). The wedding date
 * is read from weddingSites.weddingDate (its only home) and degrades gracefully
 * when unset — see the schema note in the v1.7.0 brief.
 */

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { rsvpStatusOf, rsvpStyle } from '@/app/lib/guests';
import { sumTotals, formatMoney } from '@/app/lib/budget';
import { statusOf, vendorStatusStyle } from '@/app/lib/vendors';
import { formatTime } from '@/app/lib/timeline';

/** Whole-day difference from today (local midnight) to an ISO "YYYY-MM-DD". */
function daysUntil(iso: string, todayMs: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Math.round((target - todayMs) / 86_400_000);
}

/** Format an ISO "YYYY-MM-DD" as a friendly date (no timezone drift). */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(m[2]) - 1] ?? ''} ${Number(m[3])}, ${m[1]}`;
}

export default function HomePage() {
  const { workspaceId, workspaceName } = useWorkspace();

  // Existing module queries — no new Convex functions. May be undefined while loading.
  const guests    = useQuery(api.guests.list,          { workspaceId });
  const lineItems = useQuery(api.budget.listLineItems,  { workspaceId });
  const settings  = useQuery(api.budget.getSettings,    { workspaceId });
  const vendors   = useQuery(api.vendors.listVendors,   { workspaceId });
  const items     = useQuery(api.timeline.listItems,    { workspaceId });
  const site      = useQuery(api.weddingSite.get,       { workspaceId });

  // Reuses the same mutation the Guests module uses — the one light "action".
  const createGuest = useMutation(api.guests.create);

  // "Today" captured once at mount (lazy initializer, not an impure render call)
  // so the countdown is stable across re-renders.
  const [todayMs] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  });

  const [quickName, setQuickName] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    const name = quickName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      // Matches the guest modal's defaults: side "both", RSVP "pending".
      await createGuest({ workspaceId, name, side: 'both' });
      setQuickName('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-8">

        {/* Hero — countdown */}
        <CountdownHero
          weddingDate={site?.weddingDate ?? null}
          coupleNames={site?.coupleNames ?? null}
          workspaceName={workspaceName}
          todayMs={todayMs}
          loading={site === undefined}
        />

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <GuestsCard
            guests={guests}
            quickName={quickName}
            onQuickName={setQuickName}
            onQuickAdd={handleQuickAdd}
            adding={adding}
          />
          <BudgetCard lineItems={lineItems} settings={settings} />
          <VendorsCard vendors={vendors} />
          <TimelineCard items={items} />
          <WebsiteCard site={site} />
        </div>
      </div>
    </div>
  );
}

// ── Shared card shell ─────────────────────────────────────────────────────────

function Card({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-rule rounded-xl bg-white/60 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg text-ink">{title}</h2>
        <Link href={href} className="text-xs text-ink-faint hover:text-ink-soft transition-colors shrink-0">
          {linkLabel} →
        </Link>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

/** A small colored-dot stat, matching the module list styling. */
function DotStat({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-ink-soft">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="tabular-nums text-ink font-medium">{value}</span>
      <span className="text-ink-faint">{label}</span>
    </div>
  );
}

function Loading() {
  return <p className="text-sm text-ink-faint">Loading…</p>;
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-faint">{children}</p>;
}

// ── Countdown hero ──────────────────────────────────────────────────────────

function CountdownHero({
  weddingDate,
  coupleNames,
  workspaceName,
  todayMs,
  loading,
}: {
  weddingDate: string | null;
  coupleNames: string | null;
  workspaceName: string;
  todayMs: number;
  loading: boolean;
}) {
  const days = weddingDate ? daysUntil(weddingDate, todayMs) : null;
  const title = coupleNames || workspaceName;

  let headline: React.ReactNode;
  let sub: React.ReactNode;

  if (loading) {
    headline = <span className="text-ink-faint">…</span>;
    sub = null;
  } else if (weddingDate && days !== null) {
    if (days > 1) {
      headline = <><span className="tabular-nums">{days}</span> days to go</>;
    } else if (days === 1) {
      headline = 'Tomorrow!';
    } else if (days === 0) {
      headline = 'Today — congratulations!';
    } else {
      headline = 'Married 🎉';
    }
    sub = <>{formatDate(weddingDate)}</>;
  } else {
    // Graceful degrade: no wedding date set anywhere.
    headline = 'Set your wedding date';
    sub = (
      <Link href="/website" className="text-accent hover:underline">
        Add it in your Wedding Website →
      </Link>
    );
  }

  return (
    <section className="border border-rule rounded-xl bg-white/60 px-6 py-10 text-center animate-fade-in">
      <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-3">{title}</p>
      <h1 className="font-serif font-light text-4xl sm:text-5xl text-ink leading-tight">{headline}</h1>
      {sub && <p className="text-sm text-ink-soft mt-4">{sub}</p>}
    </section>
  );
}

// ── Guests ────────────────────────────────────────────────────────────────────

function GuestsCard({
  guests,
  quickName,
  onQuickName,
  onQuickAdd,
  adding,
}: {
  guests: Doc<'guests'>[] | undefined;
  quickName: string;
  onQuickName: (v: string) => void;
  onQuickAdd: (e: FormEvent) => void;
  adding: boolean;
}) {
  return (
    <Card title="Guests" href="/guests" linkLabel="View list">
      {guests === undefined ? (
        <Loading />
      ) : guests.length === 0 ? (
        <EmptyHint>No guests yet — add your first below or in the Guest List.</EmptyHint>
      ) : (
        <>
          <p className="text-3xl font-serif text-ink tabular-nums mb-3">
            {guests.length}
            <span className="text-sm text-ink-faint font-sans ml-2">
              guest{guests.length !== 1 ? 's' : ''}
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <DotStat dot={rsvpStyle('yes').dot}   label="attending" value={guests.filter(g => rsvpStatusOf(g) === 'yes').length} />
            <DotStat dot={rsvpStyle('no').dot}    label="declined"  value={guests.filter(g => rsvpStatusOf(g) === 'no').length} />
            <DotStat dot={rsvpStyle('pending').dot} label="awaiting" value={guests.filter(g => { const s = rsvpStatusOf(g); return s === 'pending' || s === 'maybe'; }).length} />
          </div>
        </>
      )}

      {/* Light action: trivial single-field quick-add (reuses guests.create). */}
      <form onSubmit={onQuickAdd} className="flex items-center gap-2 mt-4 pt-4 border-t border-rule">
        <input
          type="text"
          value={quickName}
          onChange={e => onQuickName(e.target.value)}
          placeholder="Add a guest…"
          aria-label="Quick add a guest by name"
          className="app-input flex-1 text-sm px-3 py-2"
        />
        <button type="submit" disabled={adding || !quickName.trim()} className="btn btn-secondary text-sm px-3 py-2 shrink-0">
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>
    </Card>
  );
}

// ── Budget ────────────────────────────────────────────────────────────────────

function BudgetCard({
  lineItems,
  settings,
}: {
  lineItems: Doc<'budgetLineItems'>[] | undefined;
  settings: Doc<'budgetSettings'> | null | undefined;
}) {
  const loading = lineItems === undefined || settings === undefined;
  return (
    <Card title="Budget" href="/budget" linkLabel="View budget">
      {loading ? (
        <Loading />
      ) : lineItems.length === 0 ? (
        <EmptyHint>No line items yet — start tracking estimates and payments.</EmptyHint>
      ) : (
        (() => {
          const totals = sumTotals(lineItems);
          const target = settings?.targetBudget ?? null;
          const basis = totals.actual > 0 ? totals.actual : totals.estimated;
          const remaining = target !== null ? target - basis : null;
          const over = remaining !== null && remaining < 0;
          return (
            <>
              <p className="text-3xl font-serif text-ink tabular-nums mb-1">{formatMoney(totals.estimated)}</p>
              <p className="text-sm text-ink-faint mb-3">
                estimated{totals.actual > 0 && <> · {formatMoney(totals.actual)} actual</>}
              </p>
              {target !== null ? (
                <p className={`text-sm ${over ? 'text-accent' : 'text-ink-soft'}`}>
                  {over
                    ? <>Over target by {formatMoney(-(remaining ?? 0))}</>
                    : <>{formatMoney(remaining ?? 0)} left of {formatMoney(target)} target</>}
                </p>
              ) : (
                <p className="text-sm text-ink-faint">{formatMoney(totals.paid)} paid · no target set</p>
              )}
            </>
          );
        })()
      )}
    </Card>
  );
}

// ── Vendors ─────────────────────────────────────────────────────────────────

function VendorsCard({ vendors }: { vendors: Doc<'vendors'>[] | undefined }) {
  return (
    <Card title="Vendors" href="/vendors" linkLabel="View vendors">
      {vendors === undefined ? (
        <Loading />
      ) : vendors.length === 0 ? (
        <EmptyHint>No vendors yet — keep caterers, photographers, and venues in one place.</EmptyHint>
      ) : (
        <>
          <p className="text-3xl font-serif text-ink tabular-nums mb-3">
            {vendors.length}
            <span className="text-sm text-ink-faint font-sans ml-2">
              vendor{vendors.length !== 1 ? 's' : ''}
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <DotStat dot={vendorStatusStyle('booked').dot}     label="booked"     value={vendors.filter(v => statusOf(v) === 'booked').length} />
            <DotStat dot={vendorStatusStyle('contacted').dot}  label="contacted"  value={vendors.filter(v => statusOf(v) === 'contacted').length} />
            <DotStat dot={vendorStatusStyle('researching').dot} label="researching" value={vendors.filter(v => statusOf(v) === 'researching').length} />
          </div>
        </>
      )}
    </Card>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

function TimelineCard({ items }: { items: Doc<'timelineItems'>[] | undefined }) {
  return (
    <Card title="Day-of Timeline" href="/timeline" linkLabel="View timeline">
      {items === undefined ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyHint>No events yet — build a time-ordered run-of-show for the day.</EmptyHint>
      ) : (
        (() => {
          const first = [...items].sort((a, b) => a.time - b.time)[0];
          return (
            <>
              <p className="text-3xl font-serif text-ink tabular-nums mb-3">
                {items.length}
                <span className="text-sm text-ink-faint font-sans ml-2">
                  event{items.length !== 1 ? 's' : ''}
                </span>
              </p>
              {first && (
                <p className="text-sm text-ink-soft">
                  Starts <span className="text-ink font-medium tabular-nums">{formatTime(first.time)}</span>
                  <span className="text-ink-faint"> · {first.title}</span>
                </p>
              )}
            </>
          );
        })()
      )}
    </Card>
  );
}

// ── Wedding Website ───────────────────────────────────────────────────────────

function WebsiteCard({ site }: { site: Doc<'weddingSites'> | null | undefined }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <Card title="Wedding Website" href="/website" linkLabel="Manage site">
      {site === undefined ? (
        <Loading />
      ) : !site ? (
        <EmptyHint>Not set up yet — create your public wedding page.</EmptyHint>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${site.published ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <span className="text-sm font-medium text-ink">
              {site.published ? 'Published' : 'Draft — not visible yet'}
            </span>
          </div>
          {site.published ? (
            <a
              href={`${origin}/w/${site.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline break-all"
            >
              /w/{site.slug}
            </a>
          ) : (
            <p className="text-sm text-ink-faint">Publish it from the Wedding Website tab to share with guests.</p>
          )}
        </>
      )}
    </Card>
  );
}
