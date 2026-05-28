# Future Features

Deliberately out of scope for now — parked here so they aren't quietly built
into unrelated work. Add to this list whenever a tempting "quick win" is
resisted during a focused build.

## Guest List module (deferred from the v1.2.0 build)

- **RSVP invitations** — emailing guests, public RSVP pages they fill out
  themselves. (v1.2.0 RSVP status is set manually by the couple.) Future module.
- **Bulk import** — CSV upload / contact import. Manual add only for now.
- **Guest groupings / households** — each guest is an individual record today;
  family/household grouping is a future feature.
- **Table assignment from within the Guest List** — assignment stays in the
  seating planner; the guest list only shows current status read-only.
- **Data export** — belongs to the future "Export" module.

## Placeholder modules (scaffolded as tabs, not built)

Vendors, Budget, Wedding Website, Day-of Timeline currently render a branded
"coming soon" placeholder only. No backend tables/queries/mutations exist for
them yet.

## Cross-cutting (unchanged conventions)

- **Mobile responsiveness** — desktop-only remains the convention until
  explicitly changed.
- **No new third-party services** — stick with the existing stack
  (Next.js / Convex / Vercel).
