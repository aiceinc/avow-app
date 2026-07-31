'use client';

/**
 * /home — the Home / Overview dashboard (redesigned v1.10.1).
 *
 * Dashboard layout emulating Abby's `vow_dashboard` mockup (body/content only —
 * the app keeps its own ModuleTabs nav), rendered with Avow's existing palette +
 * fonts. Everything is wired to real workspace data:
 *   - greeting + wedding-day countdown (weddingSites.weddingDate, graceful when unset)
 *   - stat row: guests, budget remaining, tasks complete
 *   - budget overview (per-category spend bars), RSVP breakdown
 *   - Tasks checklist (functional CRUD — convex/tasks.ts)
 *   - Vendors list with status badges
 *   - Notes / notebook (functional CRUD — convex/notes.ts)
 *
 * Tasks + Notes are real persisted features (workspace-scoped; purged by account
 * deletion + retention via WORKSPACE_SCOPED_TABLES). No new client deps.
 */

import { useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc } from '@/convex/_generated/dataModel';
import { useWorkspace } from '@/app/components/WorkspaceContext';
import { rsvpStatusOf } from '@/app/lib/guests';
import { sumTotals, formatMoney } from '@/app/lib/budget';
import { statusOf, vendorStatusPill, vendorStatusStyle } from '@/app/lib/vendors';
import ModalShell from '@/app/components/ModalShell';
import { buildDemoContent } from '@/app/lib/demoContent';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function timeGreeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
function formatLongDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function shortFromMs(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}
function dueShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS_SHORT[Number(m[2]) - 1] ?? ''} ${Number(m[3])}`;
}
type Countdown = { past: boolean; days: number; hours: number; minutes: number };
function countdown(iso: string, nowMs: number): Countdown | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const diff = target - nowMs;
  if (diff <= 0) return { past: true, days: 0, hours: 0, minutes: 0 };
  return {
    past: false,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
  };
}

export default function HomePage() {
  const { workspaceId, partnerNames, entitlement, isDemo } = useWorkspace();
  const canEdit = entitlement.canEdit;
  const demo = useMemo(() => buildDemoContent(workspaceId), [workspaceId]);

  const me         = useQuery(api.workspaces.getMyUserId);
  const realGuests = useQuery(api.guests.list,            { workspaceId });
  const settings   = useQuery(api.budget.getSettings,     { workspaceId });
  const realLineItems = useQuery(api.budget.listLineItems,   { workspaceId });
  const realBudgetCats = useQuery(api.budget.listCategories, { workspaceId });
  const realVendors   = useQuery(api.vendors.listVendors,    { workspaceId });
  const realVendorCats = useQuery(api.vendors.listCategories,{ workspaceId });
  const realSite   = useQuery(api.weddingSite.get,        { workspaceId });
  const realTasks  = useQuery(api.tasks.list,             { workspaceId });
  const realNotes  = useQuery(api.notes.list,             { workspaceId });

  // Example-wedding fixtures in place of the (real, empty) workspace for a
  // locked account that hasn't started its trial yet — see WorkspaceContext.
  const guests    = isDemo ? demo.guests : realGuests;
  const lineItems = isDemo ? demo.budgetLineItems : realLineItems;
  const budgetCats = isDemo ? demo.budgetCategories : realBudgetCats;
  const vendors   = isDemo ? demo.vendors : realVendors;
  const vendorCats = isDemo ? demo.vendorCategories : realVendorCats;
  const site      = isDemo ? demo.weddingSite : realSite;
  const tasks     = isDemo ? demo.tasks : realTasks;
  const notes     = isDemo ? demo.notes : realNotes;

  // "Now" captured once at mount (lazy initializer — not an impure render call).
  const [nowMs] = useState(() => Date.now());
  const now = new Date(nowMs);

  const firstName =
    me?.name?.trim().split(/\s+/)[0] ||
    (partnerNames.a && partnerNames.a !== 'Partner A' ? partnerNames.a : '');
  const greeting = firstName ? `${timeGreeting(now)}, ${firstName}` : timeGreeting(now);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalGuests = guests?.length ?? 0;
  const confirmed = (guests ?? []).filter((g) => rsvpStatusOf(g) === 'yes').length;

  const totals = sumTotals(lineItems ?? []);
  const basis = totals.actual > 0 ? totals.actual : totals.estimated;
  const target = isDemo ? demo.targetBudget : (settings?.targetBudget ?? null);
  const remaining = target !== null ? target - basis : null;

  const doneTasks = (tasks ?? []).filter((t) => t.done).length;
  const totalTasks = tasks?.length ?? 0;

  const cd = site?.weddingDate ? countdown(site.weddingDate, nowMs) : null;

  // Wedding-date picker. The date lives on weddingSites.weddingDate — the same
  // field the Wedding Website module reads/writes — so setting it here is the
  // single source of truth the website pulls from. updateContent creates the
  // site row on demand if it doesn't exist yet.
  const updateContent = useMutation(api.weddingSite.updateContent);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  function openDatePicker() {
    setDateInput(site?.weddingDate ?? '');
    setDateModalOpen(true);
  }
  async function saveDate() {
    setSavingDate(true);
    try {
      await updateContent({ workspaceId, weddingDate: dateInput });
      setDateModalOpen(false);
    } finally {
      setSavingDate(false);
    }
  }
  async function clearDate() {
    setSavingDate(true);
    try {
      await updateContent({ workspaceId, weddingDate: '' });
      setDateModalOpen(false);
    } finally {
      setSavingDate(false);
    }
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto">
      <div className="min-h-full flex flex-col">
      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">

        {/* Header */}
        <div className="mb-7">
          <h1 className="font-serif font-light text-3xl text-ink leading-none">{greeting}</h1>
          <p className="text-sm text-ink-faint mt-1.5">
            {isDemo
              ? "Example wedding — here's what Avow looks like once it's filled in."
              : <>{formatLongDate(now)} &nbsp;·&nbsp; Here&rsquo;s where everything stands</>}
          </p>
        </div>

        {/* Wedding-date bar (same ink colour as the header/footer) */}
        <div className="bg-ink rounded-lg px-7 py-5 flex items-center justify-center gap-8 mb-6 min-h-[88px]">
          {cd && !cd.past ? (
            <button onClick={openDatePicker} disabled={!canEdit} title={canEdit ? 'Change wedding date' : undefined} className="flex gap-8 disabled:cursor-default">
              <CountBlock n={cd.days} label="Days" />
              <CountBlock n={cd.hours} label="Hours" />
              <CountBlock n={cd.minutes} label="Minutes" />
            </button>
          ) : cd && cd.past ? (
            <span className="font-serif font-light italic text-bg text-base">Married — congratulations! 🎉</span>
          ) : (
            <button onClick={openDatePicker} disabled={!canEdit} className="text-sm text-bg/70 hover:text-bg transition-colors disabled:opacity-50 disabled:cursor-default">
              Set your wedding date →
            </button>
          )}
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
          <StatCard label="Total guests" value={String(totalGuests)} sub={`${confirmed} confirmed`} href="/guests" />
          <StatCard
            label="Budget remaining"
            value={target !== null ? formatMoney(Math.max(0, remaining ?? 0)) : formatMoney(basis)}
            sub={target !== null ? `of ${formatMoney(target)} total` : 'spent · no target set'}
            href="/budget"
          />
          <StatCard
            label="Tasks complete"
            value={`${doneTasks}/${totalTasks}`}
            sub={totalTasks === 0 ? 'No tasks yet' : `${totalTasks - doneTasks} remaining`}
          />
        </div>

        {/* Budget overview + RSVPs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <BudgetOverview lineItems={lineItems} categories={budgetCats} basis={basis} target={target} />
          <RsvpCard guests={guests} />
        </div>

        {/* Tasks + Vendors + Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <TasksCard workspaceId={workspaceId} tasks={tasks} canEdit={canEdit} />
            <VendorsCard vendors={vendors} categories={vendorCats} />
          </div>
          <NotesCard workspaceId={workspaceId} notes={notes} canEdit={canEdit} />
        </div>

      </div>
      </div>
    </div>

    {dateModalOpen && (
      <ModalShell
        onDismiss={() => setDateModalOpen(false)}
        padded
        cardClassName="bg-white rounded-xl shadow-2xl p-6 max-w-xs w-full"
      >
          <h2 className="font-serif text-xl text-ink mb-4">Wedding date</h2>
          <input
            autoFocus
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="app-input w-full text-sm px-3 py-2.5 mb-4 tabular-nums"
          />
          <div className="flex items-center gap-2">
            {site?.weddingDate && (
              <button
                type="button"
                onClick={clearDate}
                disabled={savingDate}
                className="text-xs text-ink-faint hover:text-red-600 transition-colors mr-auto"
              >
                Clear date
              </button>
            )}
            <button onClick={() => setDateModalOpen(false)} className="btn btn-secondary text-sm px-4 py-2 ml-auto">
              Cancel
            </button>
            <button onClick={saveDate} disabled={savingDate} className="btn btn-primary text-sm px-4 py-2">
              {savingDate ? 'Saving…' : 'Save'}
            </button>
          </div>
      </ModalShell>
    )}
    </>
  );
}

// ── Small shared pieces ───────────────────────────────────────────────────────

function CountBlock({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-serif font-light text-3xl text-accent leading-none tabular-nums">{n}</div>
      <div className="text-[0.6rem] text-bg/50 tracking-[0.08em] uppercase mt-1">{label}</div>
    </div>
  );
}

function StatCard({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const inner = (
    <>
      <div className="text-[0.62rem] text-ink-faint tracking-[0.08em] uppercase mb-1">{label}</div>
      <div className="font-serif font-light text-3xl text-ink leading-none tabular-nums">{value}</div>
      <div className="text-xs text-ink-faint mt-1">{sub}</div>
    </>
  );
  const cls = 'bg-white border border-rule rounded-lg px-5 py-4 block';
  return href ? (
    <Link href={href} className={`${cls} hover:border-accent transition-colors`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function CardShell({ label, href, linkLabel, children }: { label: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-rule rounded-lg p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[0.62rem] text-ink-faint tracking-[0.08em] uppercase">{label}</div>
        {href && linkLabel && (
          <Link href={href} className="text-xs text-ink-faint hover:text-ink-soft transition-colors">{linkLabel} →</Link>
        )}
      </div>
      {children}
    </section>
  );
}

// ── Budget overview ───────────────────────────────────────────────────────────

function BudgetOverview({
  lineItems, categories, basis, target,
}: {
  lineItems: Doc<'budgetLineItems'>[] | undefined;
  categories: Doc<'budgetCategories'>[] | undefined;
  basis: number;
  target: number | null;
}) {
  const loading = lineItems === undefined || categories === undefined;
  return (
    <CardShell label="Budget overview" href="/budget" linkLabel="View budget">
      {loading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : lineItems.length === 0 ? (
        <p className="text-sm text-ink-faint">No budget items yet — start tracking estimates and payments.</p>
      ) : (
        (() => {
          // Per-category spend (actual where known, else estimated).
          const nameById = new Map(categories.map((c) => [c._id as string, c.name]));
          const byCat = new Map<string, number>();
          for (const item of lineItems) {
            const amt = item.actualCost ?? item.estimatedCost;
            byCat.set(item.categoryId, (byCat.get(item.categoryId) ?? 0) + amt);
          }
          const rows = [...byCat.entries()]
            .map(([id, amt]) => ({ name: nameById.get(id) ?? 'Uncategorized', amt }))
            .sort((a, b) => b.amt - a.amt)
            .slice(0, 5);
          const maxAmt = Math.max(1, ...rows.map((r) => r.amt));
          const progress = target ? Math.min(100, (basis / target) * 100) : null;
          return (
            <>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[0.78rem] text-ink-soft">Spent so far</span>
                <span className="font-serif text-lg text-ink tabular-nums">{formatMoney(basis)}</span>
              </div>
              <div className="h-[3px] bg-bg-tint rounded mb-4">
                {progress !== null && <div className="h-[3px] bg-accent rounded" style={{ width: `${progress}%` }} />}
              </div>
              <div className="flex flex-col gap-2">
                {rows.map((r) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <span className="text-xs text-ink-soft w-24 shrink-0 truncate">{r.name}</span>
                    <span className="flex-1 h-[3px] bg-bg-tint rounded">
                      <span className="block h-[3px] bg-accent rounded" style={{ width: `${(r.amt / maxAmt) * 100}%` }} />
                    </span>
                    <span className="text-xs text-ink-faint w-14 text-right shrink-0 tabular-nums">{formatMoney(r.amt)}</span>
                  </div>
                ))}
              </div>
            </>
          );
        })()
      )}
    </CardShell>
  );
}

// ── RSVPs ─────────────────────────────────────────────────────────────────────

function RsvpCard({ guests }: { guests: Doc<'guests'>[] | undefined }) {
  return (
    <CardShell label="RSVPs" href="/guests" linkLabel="View guests">
      {guests === undefined ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : guests.length === 0 ? (
        <p className="text-sm text-ink-faint">No guests yet — build your guest list to track RSVPs.</p>
      ) : (
        (() => {
          const total = guests.length;
          const count = (s: string) => guests.filter((g) => rsvpStatusOf(g) === s).length;
          const yes = count('yes'), maybe = count('maybe'), no = count('no'), pending = count('pending');
          const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
          return (
            <>
              <div className="flex flex-col gap-2.5 mb-3">
                <RsvpRow label="Coming" count={yes} pct={pct(yes)} fill="bg-emerald-500" />
                <RsvpRow label="Maybe" count={maybe} pct={pct(maybe)} fill="bg-amber-500" />
                <RsvpRow label="Declined" count={no} pct={pct(no)} fill="bg-rose-400" />
              </div>
              <div className="text-xs text-ink-faint">
                {pending > 0 ? `${pending} guest${pending !== 1 ? 's' : ''} haven't responded yet` : 'Everyone has responded'}
              </div>
            </>
          );
        })()
      )}
    </CardShell>
  );
}

function RsvpRow({ label, count, pct, fill }: { label: string; count: number; pct: number; fill: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-ink-soft w-14 shrink-0">{label}</span>
      <span className="flex-1 h-1.5 bg-bg-tint rounded-full overflow-hidden">
        <span className={`block h-1.5 rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-ink-faint w-7 text-right shrink-0 tabular-nums">{count}</span>
    </div>
  );
}

// ── Tasks (functional CRUD) ─────────────────────────────────────────────────

function TasksCard({ workspaceId, tasks, canEdit }: { workspaceId: Doc<'workspaces'>['_id']; tasks: Doc<'tasks'>[] | undefined; canEdit: boolean }) {
  const addTask = useMutation(api.tasks.add);
  const toggleTask = useMutation(api.tasks.toggle);
  const removeTask = useMutation(api.tasks.remove);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) { setAdding(false); return; }
    await addTask({ workspaceId, title: t });
    setTitle('');
    setAdding(false);
  }

  return (
    <CardShell label="Tasks">
      {tasks === undefined ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <div key={task._id} className="group flex items-center gap-2.5 py-1.5 border-b border-rule/60 last:border-b-0">
              <button
                onClick={() => toggleTask({ taskId: task._id })}
                disabled={!canEdit}
                aria-label={task.done ? 'Mark not done' : 'Mark done'}
                className={`w-3.5 h-3.5 rounded-sm border shrink-0 flex items-center justify-center transition-colors disabled:cursor-default ${
                  task.done ? 'bg-ink border-ink' : 'border-ink/25 hover:border-accent'
                }`}
              >
                {task.done && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="var(--bg)" strokeWidth="1.2" strokeLinecap="round" /></svg>
                )}
              </button>
              <span className={`text-[0.78rem] flex-1 ${task.done ? 'line-through text-ink-faint' : 'text-ink-soft'}`}>{task.title}</span>
              <span className="text-[0.65rem] text-ink-faint shrink-0">{task.done ? 'Done' : task.dueDate ? dueShort(task.dueDate) : ''}</span>
              {canEdit && (
                <button
                  onClick={() => removeTask({ taskId: task._id })}
                  aria-label="Delete task"
                  className="text-ink-faint hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {adding ? (
            <form onSubmit={submit} className="mt-2">
              <input
                autoFocus
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={submit}
                onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setTitle(''); } }}
                placeholder="New task…"
                className="app-input w-full text-sm px-2.5 py-1.5"
              />
            </form>
          ) : (
            <button onClick={() => setAdding(true)} disabled={!canEdit} className="text-xs text-accent mt-3 self-start hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">+ Add task</button>
          )}
        </div>
      )}
    </CardShell>
  );
}

// ── Vendors ───────────────────────────────────────────────────────────────────

function VendorsCard({ vendors, categories }: { vendors: Doc<'vendors'>[] | undefined; categories: Doc<'vendorCategories'>[] | undefined }) {
  return (
    <CardShell label="Vendors" href="/vendors" linkLabel="View vendors">
      {vendors === undefined || categories === undefined ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : vendors.length === 0 ? (
        <p className="text-sm text-ink-faint">No vendors yet — keep caterers, photographers, and venues in one place.</p>
      ) : (
        <div className="flex flex-col">
          {(() => {
            const nameById = new Map(categories.map((c) => [c._id as string, c.name]));
            return vendors.slice(0, 6).map((v) => {
              const status = statusOf(v);
              return (
                <div key={v._id} className="flex items-center justify-between gap-2 py-1.5 border-b border-rule/60 last:border-b-0">
                  <div className="min-w-0">
                    <div className="text-[0.78rem] text-ink truncate">{v.name}</div>
                    <div className="text-[0.68rem] text-ink-faint truncate">{v.categoryId ? nameById.get(v.categoryId) ?? 'Uncategorized' : 'Uncategorized'}</div>
                  </div>
                  <span className={`text-[0.6rem] font-medium px-2 py-0.5 rounded-sm shrink-0 ${vendorStatusPill(status)}`}>
                    {vendorStatusStyle(status).label}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      )}
    </CardShell>
  );
}

// ── Notes / notebook (functional CRUD) ────────────────────────────────────────

function NotesCard({ workspaceId, notes, canEdit }: { workspaceId: Doc<'workspaces'>['_id']; notes: Doc<'notes'>[] | undefined; canEdit: boolean }) {
  const addNote = useMutation(api.notes.add);
  const removeNote = useMutation(api.notes.remove);

  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) { setAdding(false); return; }
    await addNote({ workspaceId, text: t });
    setText('');
    setAdding(false);
  }

  return (
    <section className="bg-bg-tint/50 border border-rule rounded-lg p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[0.62rem] text-ink-faint tracking-[0.08em] uppercase">Our notes</span>
      </div>

      {notes === undefined ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : (
        <div className="flex flex-col">
          {notes.length === 0 && !adding && (
            <p className="text-[0.78rem] text-ink-faint">No notes yet — jot down ideas, reminders, and to-dos here.</p>
          )}
          {notes.map((note) => (
            <div key={note._id} className="group py-2 border-b border-rule/60 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-serif italic text-[0.88rem] text-ink-soft leading-relaxed">{note.text}</p>
                {canEdit && (
                  <button
                    onClick={() => removeNote({ noteId: note._id })}
                    aria-label="Delete note"
                    className="text-ink-faint hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0 mt-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="text-[0.6rem] text-accent mt-0.5">{shortFromMs(note._creationTime)}</div>
            </div>
          ))}

          {adding ? (
            <form onSubmit={submit} className="mt-2">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={submit}
                onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setText(''); } }}
                rows={2}
                placeholder="Add a note…"
                className="app-input w-full text-sm px-2.5 py-1.5 resize-y"
              />
            </form>
          ) : (
            <button onClick={() => setAdding(true)} disabled={!canEdit} className="text-xs text-accent mt-3 self-start hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">+ Add a note</button>
          )}
        </div>
      )}
    </section>
  );
}
