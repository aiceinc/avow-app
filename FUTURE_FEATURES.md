# Future Features

Deliberately out of scope for now — parked here so they aren't quietly built
into unrelated work. Add to this list whenever a tempting "quick win" is
resisted during a focused build. Remove an entry when it actually ships.

> **Last reconciled against the codebase: 2026-07-21 (v1.24.0).**
> The previous version of this file was badly out of date — it still described
> Vendors, Budget, Wedding Website and Day-of Timeline as unbuilt placeholder
> tabs. All four shipped long ago (Budget v1.3.0, Vendors v1.4.0, Timeline
> v1.5.0, Wedding Website v1.6.0) and are live in production.

## ⚠️ Promised in the Privacy Policy but NOT built

These are called out separately because they are not just "nice to have" — the
published Privacy Policy describes them as existing product behaviour. Each must
either be **built** or **reworded by counsel** (never edit counsel's text
directly). Raised with Brooke 2026-07-21.

- **"Export everything"** — the policy names this as the mechanism for exercising
  data portability under **Quebec Law 25 / GDPR**. Highest priority of the three:
  a statutory right currently pointing at a control that doesn't exist.
  Requests can be served manually via privacy@avow.wedding in the meantime.
- **Spreadsheet import and export** — the policy says users can import guest
  lists from a spreadsheet and export the guest list, budget, seating chart and
  timeline "at any time". Neither direction exists; guests are added manually.
- **Adjustable reminder frequency** — the policy says optional reminders (e.g.
  the trial-end reminder) can be adjusted "in your settings". No such setting.
  The trial-end reminder is currently sent by **Stripe** (Dashboard → Settings →
  Subscriptions and emails) and is not user-configurable.

## Advertised on /auth as "coming soon" (unbuilt, unenforced)

- **Client portal** — planner-tier perk listed in pricing copy.
- **Branded exports** — planner-tier perk listed in pricing copy.

## Guest List module

- **RSVP invitations by email** — sending invites from the platform. (Public RSVP
  pages themselves DO exist, via the Wedding Website module + token RSVP; what's
  missing is Avow emailing guests. The app has no transactional email at all.)
- **Bulk import** — CSV upload / contact import. Manual add only for now.
- **Guest groupings / households** — each guest is an individual record today.
- **Table assignment from within the Guest List** — assignment stays in the
  seating planner; the guest list only shows current status read-only.

## Budget Tracker module

- **Category reordering** — drag-and-drop with persisted `order`. Schema already
  has an `order` field and the UI sorts by it; only the drag-drop UI is missing.
- **Payment history / installments** — "Paid" is current-state only; no log of
  who/when, and Partial is a single amount-paid number.
- **Receipts / document attachments.**
- **Multi-currency** — all amounts unlabeled (CAD assumed).
- **Headcount-based calculations** — e.g. "$120/guest × 75"; no Guest List
  integration for the budget.
- **Budget templates / copying budgets between workspaces.**
- **Date tracking** for when line items were paid.
- **Cents** — amounts are whole dollars; revisit if real invoices need
  sub-dollar precision.

## Privacy / compliance

- **Cookie banner + `/cookies` page** — deferred; referenced as a gap in the
  privacy review.

## Cross-cutting conventions

- **Mobile responsiveness** — desktop-only remains the convention. ⚠️ Worth
  revisiting before public launch: the primary users are couples and guests, who
  skew mobile. This is an explicit choice, not an oversight, but it is a real
  product risk at launch.
- **No new third-party services** — stick to the existing stack (Next.js /
  Convex / Vercel / Stripe).
