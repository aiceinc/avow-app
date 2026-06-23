'use client';

/**
 * /auth — the app's logged-out front door (v1.10.0).
 *
 * Reworked from a centered sign-in box into a full-screen marketing experience
 * (emulating Abby's mockup: nav + hero + features + how-it-works + pricing +
 * bottom CTA + footer), with sign-in / sign-up relocated to the top-right and
 * opened in a modal. Aesthetic uses Avow's existing palette + fonts (Fraunces /
 * Inter Tight, ink/bg/accent tokens) — NOT the mockup's.
 *
 * ⚠️ PRICING IS PRESENTATIONAL (v1). There is no billing backend yet (deferred —
 * no payment processor, gated on Brooke's subscription terms). Every trial /
 * plan CTA simply opens the SIGN-UP flow (create account); no card is collected
 * and no real subscription is created. The tiers/prices/trial copy are a
 * faithful first pass from the mockup and must be reconciled with the final
 * subscription terms (free tier, auto-renew, etc.) before taking real payments.
 * The hero image is intentionally left blank for Ben to supply.
 */

import { useState, FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AppFooter from '@/app/components/AppFooter';

type Flow = 'signIn' | 'signUp';

/** Smooth-scroll to an in-page section (nav tabs / hero link). */
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

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
  return flow === 'signIn'
    ? 'Sign-in failed. Check your email and password and try again.'
    : 'Could not create account. Please try again.';
}

type Tier = {
  id: string;     // billingConfig tier id (passed to checkout)
  tier: string;   // display name
  monthly: number; // annual price is monthly × 12, then 20% off
  tagline: string;
  perks: string[];
  featured?: boolean;
  badge?: string;
};

/** Annual billing discount (20% off the monthly rate). */
const ANNUAL_DISCOUNT = 0.2;

const TIERS: Tier[] = [
  {
    id: 'couple',
    tier: 'Couple',
    monthly: 49,
    tagline: 'Everything to plan your own wedding, beautifully, in one place.',
    perks: ['Unlimited guests & RSVPs', 'Seating planner', 'Budget tracker', 'Day-of timeline', 'Vendor management', 'Wedding website'],
  },
  {
    id: 'planner_pro',
    tier: 'Planner Pro',
    monthly: 99,
    tagline: 'For wedding planners building their book of business.',
    perks: ['Everything in Couple', 'Up to 5 weddings', 'All your clients in one place'],
    featured: true,
    badge: 'Most popular',
  },
  {
    id: 'planner_max',
    tier: 'Planner Max',
    monthly: 399,
    tagline: 'For established studios running many weddings at once.',
    perks: ['Everything in Planner Pro', 'Up to 50 weddings', 'Client portal (coming soon)', 'Branded exports (coming soon)', 'Priority support'],
  },
];

const FEATURES = [
  { n: '01', name: 'Guest list & RSVPs', desc: 'Track every guest, dietary need, and plus-one. Share invite links and collect RSVPs in one place.' },
  { n: '02', name: 'Budget tracker', desc: 'Set a total budget, break it down by category, and track every payment as it happens.' },
  { n: '03', name: 'Seating planner', desc: 'Drag and drop guests into tables. Handle dietary restrictions and family dynamics with ease.' },
  { n: '04', name: 'Wedding website', desc: 'A beautiful, personalised page for your guests with all the details they need.' },
  { n: '05', name: 'Day-of timeline', desc: 'Build a minute-by-minute schedule and share it with your venue, photographer, and wedding party.' },
  { n: '06', name: 'Vendors', desc: 'Keep caterers, photographers, florists, and venues in one place — with contacts, status, and budget links.' },
];

const STEPS = [
  { n: '01', title: 'Create your wedding', desc: 'Name your wedding workspace and invite your partner. Avow sets everything up from there.' },
  { n: '02', title: 'Build your guest list', desc: 'Add guests, sides, and dietary notes. Share personal invite links and collect RSVPs.' },
  { n: '03', title: 'Track your budget', desc: 'Add vendors and costs as you book them. See exactly where you stand at any moment.' },
  { n: '04', title: 'Enjoy your wedding', desc: 'Share your day-of timeline with your team and show up knowing everything is handled.' },
];

export default function AuthPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();

  const [authOpen, setAuthOpen] = useState(false);
  const [flow, setFlow] = useState<Flow>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [annual, setAnnual] = useState(false);

  function openAuth(f: Flow) {
    setFlow(f);
    setError(null);
    setAuthOpen(true);
  }

  // A pricing CTA: remember the chosen plan, then open sign-up. After auth, the
  // /account billing section picks it up (see post-auth routing in handleSubmit).
  function choosePlan(tier: string, interval: string) {
    try {
      localStorage.setItem('avow:pendingPlan', JSON.stringify({ tier, interval }));
    } catch {
      /* ignore */
    }
    openAuth('signUp');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn('password', { email, password, flow });
      let pendingPlan: string | null = null;
      try {
        pendingPlan = localStorage.getItem('avow:pendingPlan');
      } catch {
        /* ignore */
      }
      router.push(pendingPlan ? '/account' : '/');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(friendlyError(raw, flow));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="top" className="min-h-screen bg-bg text-ink">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 flex items-center justify-between gap-4 bg-ink px-6 sm:px-10 h-14">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Avow home"
          className="shrink-0"
        >
          <span className="wordmark text-xl" style={{ color: 'var(--bg)' }}>
            avow<span className="dot" />
          </span>
        </button>

        <div className="hidden md:flex items-stretch h-14 mx-2">
          <button onClick={() => scrollToId('features')} className="flex items-center px-4 text-[0.78rem] tracking-wide text-bg/55 hover:text-bg border-b-2 border-transparent transition-colors">Features</button>
          <button onClick={() => scrollToId('how')} className="flex items-center px-4 text-[0.78rem] tracking-wide text-bg/55 hover:text-bg border-b-2 border-transparent transition-colors">How it works</button>
          <button onClick={() => scrollToId('pricing')} className="flex items-center px-4 text-[0.78rem] tracking-wide text-bg/55 hover:text-bg border-b-2 border-transparent transition-colors">Pricing</button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => openAuth('signIn')}
            className="text-[0.78rem] tracking-wide text-bg/60 hover:text-bg transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => openAuth('signUp')}
            className="text-[0.78rem] font-medium tracking-wide text-bg border border-bg/35 rounded-sm px-4 py-2 hover:bg-bg hover:text-ink transition-colors"
          >
            Get started
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 min-h-[520px]">
        {/* Content centered within the left column */}
        <div className="flex flex-col justify-center px-6 sm:px-10 py-16 lg:py-20">
          <div className="w-full max-w-md mx-auto">
            <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent mb-5">Wedding planning, simplified</p>
            <h1 className="font-serif font-light text-5xl sm:text-6xl leading-[1.08] mb-5">
              Every detail,<br /><em className="italic">one place</em>
            </h1>
            <p className="text-[15px] text-ink-soft leading-relaxed mb-8 max-w-[38ch]">
              From guest lists to seating charts, budgets to timelines — Avow keeps everything organised so you can
              focus on what matters.
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <button onClick={() => openAuth('signUp')} className="btn btn-primary text-sm px-7 py-3.5">
                Get started
              </button>
              <button onClick={() => scrollToId('how')} className="text-sm text-ink-soft border-b border-ink/20 pb-px hover:text-ink transition-colors">
                See how it works
              </button>
            </div>
            <p className="text-xs text-ink-faint mt-4">Plans from $49/mo · cancel anytime.</p>
          </div>
        </div>

        {/* Hero image — filleted bottom-left corner only */}
        <div className="relative overflow-hidden bg-bg-tint min-h-[260px] md:min-h-[520px] border-l border-rule rounded-bl-[3rem]">
          <Image
            src="/hero.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="max-w-5xl mx-auto px-6 sm:px-10 py-20 scroll-mt-14">
        <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent text-center mb-4">Everything you need</p>
        <h2 className="font-serif font-light text-4xl text-center leading-tight mb-12">
          Built for the way<br />couples <em className="italic">actually</em> plan
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
          {FEATURES.map((f) => (
            <FeatureCell key={f.n} f={f} />
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section id="how" className="bg-ink py-20 scroll-mt-14">
        <div className="max-w-5xl mx-auto px-6 sm:px-10">
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-accent text-center mb-4">How it works</p>
          <h2 className="font-serif font-light text-4xl text-center leading-tight text-bg mb-12">
            Up and running<br /><em className="italic">in minutes</em>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="font-serif font-light text-4xl text-accent mb-2.5">{s.n}</div>
                <div className="text-sm font-medium text-bg mb-1.5">{s.title}</div>
                <div className="text-[0.8rem] text-bg/50 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 sm:px-10 py-20 scroll-mt-14">
        <h2 className="font-serif font-light text-4xl text-center mb-8">Pricing</h2>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className={`text-sm transition-colors ${annual ? 'text-ink-soft' : 'text-ink font-medium'}`}>Monthly</span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
            onClick={() => setAnnual((a) => !a)}
            className={`relative w-11 h-6 rounded-full transition-colors ${annual ? 'bg-ink' : 'bg-rule'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${annual ? 'translate-x-5' : ''}`} />
          </button>
          <span className={`text-sm transition-colors ${annual ? 'text-ink font-medium' : 'text-ink-soft'}`}>Annually</span>
          <span className="text-[0.65rem] font-medium bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-sm tracking-wide">Save 20%</span>
        </div>

        {/* Billing notice */}
        <p className="text-center text-[0.78rem] text-ink-soft mb-8">
          Billed monthly or annually · your subscription starts right away · cancel anytime.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {TIERS.map((t) => (
            <PriceCard key={t.tier} tier={t} annual={annual} onChoose={choosePlan} />
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 sm:px-10 py-24 text-center">
        <h2 className="font-serif font-light text-5xl leading-tight mb-4">
          Your wedding,<br /><em className="italic">beautifully organised</em>
        </h2>
        <p className="text-[15px] text-ink-soft mb-8">Get started today — cancel anytime.</p>
        <button onClick={() => openAuth('signUp')} className="btn btn-primary text-sm px-7 py-3.5">Get started</button>
      </section>

      {/* ── Footer (shared dark footer) ─────────────────────────────────────── */}
      <AppFooter />

      {/* ── Auth modal ──────────────────────────────────────────────────────── */}
      {authOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in p-4"
          style={{ background: 'rgba(26, 31, 46, 0.35)' }}
          onClick={() => setAuthOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="wordmark text-2xl">avow<span className="dot" /></span>
              <button onClick={() => setAuthOpen(false)} className="text-ink-faint hover:text-ink-soft text-sm transition-colors" aria-label="Close">✕</button>
            </div>

            {/* Tab switcher */}
            <div className="flex border border-rule rounded-lg p-1 mb-6">
              <button
                type="button"
                onClick={() => { setFlow('signIn'); setError(null); }}
                className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${flow === 'signIn' ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink-soft'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { setFlow('signUp'); setError(null); }}
                className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${flow === 'signUp' ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink-soft'}`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="app-input w-full text-sm px-3 py-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className="app-input w-full text-sm px-3 py-2.5"
                />
                {flow === 'signUp' && <p className="text-xs text-ink-faint mt-1">At least 8 characters.</p>}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span className="mt-px shrink-0">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary w-full text-sm py-2.5">
                {loading ? 'Please wait…' : flow === 'signIn' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feature cell (expandable, with a demo-video slot) ────────────────────────

function FeatureCell({ f }: { f: { n: string; name: string; desc: string; video?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-bg p-8">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full text-left">
        <div className="font-serif text-sm text-accent mb-3">{f.n}</div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-ink">{f.name}</div>
          <span className={`text-ink-faint text-xs shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
        <div className="text-[0.8rem] text-ink-soft leading-relaxed mt-1.5">{f.desc}</div>
      </button>

      {open && (
        <div className="mt-4 animate-fade-in">
          {f.video ? (
            // Drop a short, muted, looping demo clip in /public and set `video` on
            // the feature to enable this. (Ben to supply the clips.)
            <video
              src={f.video}
              autoPlay
              loop
              muted
              playsInline
              className="w-full rounded-md border border-rule"
            />
          ) : (
            <div className="aspect-video bg-bg-tint rounded-md border border-rule flex items-center justify-center">
              <span className="text-[0.65rem] tracking-[0.14em] uppercase text-ink-faint/70">Demo video coming soon</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Price card ──────────────────────────────────────────────────────────────

function PriceCard({ tier, annual, onChoose }: { tier: Tier; annual: boolean; onChoose: (tier: string, interval: string) => void }) {
  const annualPerMonth = Math.round(tier.monthly * (1 - ANNUAL_DISCOUNT));
  const annualTotal = annualPerMonth * 12;
  return (
    <div className={`bg-white rounded-md p-8 flex flex-col ${tier.featured ? 'border-[1.5px] border-ink' : 'border border-rule'}`}>
      {tier.badge && (
        <span className="self-start text-[0.6rem] font-medium bg-ink text-bg px-2.5 py-1 rounded-sm tracking-[0.07em] uppercase mb-3">
          {tier.badge}
        </span>
      )}
      <div className="text-xs font-medium tracking-[0.12em] uppercase text-ink-soft mb-2.5">{tier.tier}</div>
      <div className="flex items-end">
        <span className="font-serif font-light text-5xl text-ink leading-none">${annual ? annualTotal : tier.monthly}</span>
        <span className="text-[0.78rem] text-ink-faint ml-0.5 mb-1">{annual ? 'annually' : '/mo'}</span>
      </div>
      <div className="text-[0.7rem] text-ink-faint mt-1 min-h-[1rem]">
        {annual ? `$${annualPerMonth}/mo equivalent` : ''}
      </div>
      <p className="text-[0.78rem] text-ink-soft my-3 leading-relaxed">{tier.tagline}</p>
      <div className="h-px bg-rule mb-5" />
      <div className="space-y-2 flex-1">
        {tier.perks.map((perk) => (
          <div key={perk} className="flex items-start gap-2 text-[0.78rem] text-ink-soft leading-snug">
            <svg className="shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{perk}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChoose(tier.id, annual ? 'year' : 'month')}
        className={`block w-full text-center text-sm font-medium py-3 rounded-sm mt-6 tracking-wide transition-colors border ${
          tier.featured
            ? 'bg-ink text-bg border-ink hover:opacity-85'
            : 'border-ink text-ink hover:bg-ink hover:text-bg'
        }`}
      >
        Get started
      </button>
      <div className="text-[0.68rem] text-ink-faint text-center mt-3">Cancel anytime.</div>
    </div>
  );
}
