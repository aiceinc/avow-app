/**
 * demoContent.ts — read-only example wedding shown in place of real data for
 * a workspace that's locked and has never used its trial (WorkspaceContext's
 * `isDemo`). Purely presentational: these rows are never written to Convex —
 * the real workspace stays genuinely empty underneath, so it's fresh and
 * ready the moment a trial starts. Ids are fake and only need to be stable
 * within a render (React keys, vendor↔budget linking); they're never sent to
 * a mutation because demo mode always pairs with `canEdit: false`.
 *
 * Names/categories deliberately echo convex/vendors.ts and convex/budget.ts's
 * own DEFAULT_CATEGORIES so the example matches what a real workspace would
 * actually seed.
 */

import { Doc, Id, TableNames } from '@/convex/_generated/dataModel';

// Fixed fake timestamps (not Date.now()) so server/client render identically
// and nothing here depends on when the page happens to load.
const T0 = 1798761600000; // 2027-01-01, arbitrary stable epoch for demo rows

function fakeId<T extends TableNames>(table: T, n: number): Id<T> {
  return `demo_${table}_${n}` as Id<T>;
}

// ── Guests ───────────────────────────────────────────────────────────────────

type DemoGuest = Doc<'guests'>;

const GUESTS: Array<Pick<DemoGuest, 'name' | 'side' | 'rsvpStatus' | 'dietaryNotes' | 'hasPlusOne' | 'plusOneName'>> = [
  { name: 'Leo Andersen', side: 'both', rsvpStatus: 'yes', dietaryNotes: 'Kosher', hasPlusOne: false },
  { name: 'Nadia Petrov', side: 'both', rsvpStatus: 'yes', hasPlusOne: false },
  { name: 'Ethan Dubois', side: 'both', rsvpStatus: 'maybe', hasPlusOne: false },
  { name: 'Sophie Dubois', side: 'both', rsvpStatus: 'yes', hasPlusOne: true, plusOneName: 'Marc Dubois' },
  { name: 'Kwame Asante', side: 'Partner B', rsvpStatus: 'yes', hasPlusOne: false },
  { name: 'Ingrid Larsen', side: 'Partner B', rsvpStatus: 'pending', hasPlusOne: false },
  { name: 'Marcus Johnson', side: 'Partner B', rsvpStatus: 'yes', hasPlusOne: false },
  { name: 'Priya Sharma', side: 'Partner B', rsvpStatus: 'yes', dietaryNotes: 'Gluten-free', hasPlusOne: false },
  { name: 'Thomas Reyes', side: 'Partner B', rsvpStatus: 'no', hasPlusOne: false },
  { name: 'Helen Nakamura', side: 'Partner B', rsvpStatus: 'yes', hasPlusOne: false },
  { name: 'William Nakamura', side: 'Partner B', rsvpStatus: 'yes', hasPlusOne: false },
  { name: 'Clara Osei', side: 'Partner A', rsvpStatus: 'yes', dietaryNotes: 'Vegan', hasPlusOne: false },
  { name: 'Rafael Torres', side: 'Partner A', rsvpStatus: 'pending', hasPlusOne: false },
  { name: 'Olivia Torres', side: 'Partner A', rsvpStatus: 'yes', hasPlusOne: true, plusOneName: 'Noah Bennett' },
  { name: 'James Park', side: 'Partner A', rsvpStatus: 'yes', dietaryNotes: 'Nut allergy', hasPlusOne: false },
  { name: 'Susan Park', side: 'Partner A', rsvpStatus: 'yes', hasPlusOne: false },
  { name: 'David Chen', side: 'Partner A', rsvpStatus: 'maybe', hasPlusOne: false },
  { name: 'Margaret Chen', side: 'Partner A', rsvpStatus: 'yes', dietaryNotes: 'Vegetarian', hasPlusOne: false },
];

// ── Vendor categories + vendors ─────────────────────────────────────────────

const VENDOR_CATEGORY_NAMES = [
  'Venue',
  'Catering & Bar',
  'Photography & Video',
  'Florist & Decor',
  'Music & Entertainment',
  'Officiant',
] as const;

type DemoVendor = Pick<
  Doc<'vendors'>,
  'name' | 'status' | 'contactName' | 'email' | 'phone' | 'website'
> & { categoryIndex: number };

const VENDORS: DemoVendor[] = [
  { name: 'Willowbrook Estate', categoryIndex: 0, status: 'booked', contactName: 'Renata Silva', email: 'events@willowbrookestate.example', phone: '(416) 555-0142' },
  { name: 'Thyme & Table Catering', categoryIndex: 1, status: 'booked', contactName: 'Marcus Field', email: 'hello@thymeandtable.example' },
  { name: 'Aperture & Ivy Photography', categoryIndex: 2, status: 'booked', contactName: 'Jess Okafor', website: 'apertureandivy.example' },
  { name: 'Petal & Stem Florals', categoryIndex: 3, status: 'contacted', contactName: 'Dana Wu' },
  { name: 'The Wildflower Quartet', categoryIndex: 4, status: 'researching' },
  { name: 'Rev. Dana Whitfield', categoryIndex: 5, status: 'booked', email: 'dana@whitfieldceremonies.example' },
];

// ── Budget categories + line items ──────────────────────────────────────────

const BUDGET_CATEGORY_NAMES = [
  'Venue',
  'Catering & Bar',
  'Photography & Video',
  'Attire & Beauty',
  'Flowers & Decor',
  'Music & Entertainment',
] as const;

type DemoLineItem = Pick<
  Doc<'budgetLineItems'>,
  'name' | 'estimatedCost' | 'actualCost' | 'paidStatus' | 'amountPaid' | 'notes'
> & { categoryIndex: number; vendorIndex?: number };

const LINE_ITEMS: DemoLineItem[] = [
  { categoryIndex: 0, vendorIndex: 0, name: 'Reception hall deposit', estimatedCost: 12000, actualCost: 12000, paidStatus: 'paid' },
  { categoryIndex: 1, vendorIndex: 1, name: 'Plated dinner for 90 guests', estimatedCost: 9500, actualCost: undefined, paidStatus: 'unpaid' },
  { categoryIndex: 1, name: 'Open bar package', estimatedCost: 3200, actualCost: 3400, paidStatus: 'partial', amountPaid: 1700 },
  { categoryIndex: 2, vendorIndex: 2, name: 'Photographer — 8-hour package', estimatedCost: 4200, actualCost: 4200, paidStatus: 'paid' },
  { categoryIndex: 3, name: 'Wedding dress', estimatedCost: 2800, actualCost: 2650, paidStatus: 'paid' },
  { categoryIndex: 3, name: 'Suit rental + tailoring', estimatedCost: 900, actualCost: undefined, paidStatus: 'unpaid' },
  { categoryIndex: 4, vendorIndex: 3, name: 'Bridal bouquet + centerpieces', estimatedCost: 1800, actualCost: undefined, paidStatus: 'unpaid' },
  { categoryIndex: 5, vendorIndex: 4, name: 'Reception band, 4 hours', estimatedCost: 2600, actualCost: undefined, paidStatus: 'unpaid' },
];

export const DEMO_TARGET_BUDGET = 38000;

// ── Home dashboard extras ───────────────────────────────────────────────────

export const DEMO_WEDDING_DATE = '2027-09-18';

const TASKS: Array<Pick<Doc<'tasks'>, 'title' | 'done' | 'dueDate'>> = [
  { title: 'Book the venue', done: true },
  { title: 'Send save-the-dates', done: true },
  { title: 'Finalize catering menu', done: false, dueDate: '2027-04-15' },
  { title: 'Order invitations', done: false, dueDate: '2027-05-01' },
];

const NOTES: Array<Pick<Doc<'notes'>, 'text'>> = [
  { text: 'Ask the venue about an earlier load-in time for the florist.' },
  { text: "Grandma's ring needs resizing before the ceremony." },
];

// ── Day-of Timeline ──────────────────────────────────────────────────────────

type DemoTimelineItem = Pick<
  Doc<'timelineItems'>,
  'time' | 'title' | 'location' | 'responsibleParty' | 'isPublic'
> & { vendorIndex?: number };

const TIMELINE_ITEMS: DemoTimelineItem[] = [
  { time: 9 * 60, title: 'Hair & makeup begins', location: 'Bridal suite', responsibleParty: 'Wedding party' },
  { time: 11 * 60 + 30, title: 'First look photos', vendorIndex: 2, isPublic: false },
  { time: 13 * 60, title: 'Ceremony', location: 'Willowbrook Estate — garden', vendorIndex: 5, isPublic: true },
  { time: 13 * 60 + 30, title: 'Cocktail hour', location: 'Willowbrook Estate — terrace', isPublic: true },
  { time: 15 * 60, title: 'Reception begins', location: 'Willowbrook Estate — hall', vendorIndex: 1, isPublic: true },
  { time: 16 * 60, title: 'Speeches & toasts', isPublic: true },
  { time: 16 * 60 + 30, title: 'First dance', vendorIndex: 4, isPublic: true },
  { time: 19 * 60, title: 'Send-off', isPublic: false },
];

// ── Wedding Website ──────────────────────────────────────────────────────────

const WEDDING_SITE_CONTENT = {
  coupleNames: 'Alex & Jordan',
  venueName: 'Willowbrook Estate',
  venueLocation: '412 Orchard Lane, Caledon, ON',
  story:
    "We met on a rainy Tuesday at a bookshop neither of us usually goes to. Three years, two cats, and one very persistent proposal later — here we are.",
  travelNotes:
    "The venue is 45 minutes from downtown Toronto. A block of rooms is held at the Caledon Inn (mention 'Alex & Jordan' for the rate). Parking is free on-site.",
};

// ── Assembly ─────────────────────────────────────────────────────────────────

function withDoc<Table extends TableNames, Row extends Record<string, unknown>>(
  table: Table,
  workspaceId: Id<'workspaces'>,
  row: Row,
  i: number
): Row & { _id: Id<Table>; _creationTime: number; workspaceId: Id<'workspaces'> } {
  return {
    ...row,
    _id: fakeId(table, i),
    _creationTime: T0 + i * 1000,
    workspaceId,
  };
}

export type DemoContent = ReturnType<typeof buildDemoContent>;

/** Build the full example-wedding fixture set, scoped to a real workspaceId
 *  only so component prop types line up — nothing here is ever persisted. */
export function buildDemoContent(workspaceId: Id<'workspaces'>) {
  const guests = GUESTS.map((g, i) => withDoc('guests', workspaceId, g, i)) as Doc<'guests'>[];

  const vendorCategories = VENDOR_CATEGORY_NAMES.map((name, i) =>
    withDoc('vendorCategories', workspaceId, { name, order: i, isDefault: true }, i)
  ) as Doc<'vendorCategories'>[];
  const vendors = VENDORS.map(({ categoryIndex, ...v }, i) =>
    withDoc('vendors', workspaceId, { ...v, categoryId: vendorCategories[categoryIndex]._id }, i)
  ) as Doc<'vendors'>[];

  const budgetCategories = BUDGET_CATEGORY_NAMES.map((name, i) =>
    withDoc('budgetCategories', workspaceId, { name, order: i, isDefault: true }, i)
  ) as Doc<'budgetCategories'>[];
  const budgetLineItems = LINE_ITEMS.map(({ categoryIndex, vendorIndex, ...item }, i) =>
    withDoc(
      'budgetLineItems',
      workspaceId,
      {
        ...item,
        categoryId: budgetCategories[categoryIndex]._id,
        vendorId: vendorIndex !== undefined ? vendors[vendorIndex]._id : undefined,
      },
      i
    )
  ) as Doc<'budgetLineItems'>[];

  const tasks = TASKS.map((t, i) => withDoc('tasks', workspaceId, t, i)) as Doc<'tasks'>[];
  const notes = NOTES.map((n, i) => withDoc('notes', workspaceId, n, i)) as Doc<'notes'>[];

  const timelineItems = TIMELINE_ITEMS.map(({ vendorIndex, ...item }, i) =>
    withDoc(
      'timelineItems',
      workspaceId,
      { ...item, vendorId: vendorIndex !== undefined ? vendors[vendorIndex]._id : undefined },
      i
    )
  ) as Doc<'timelineItems'>[];

  const weddingSite = withDoc(
    'weddingSites',
    workspaceId,
    { slug: 'demo', published: false, weddingDate: DEMO_WEDDING_DATE, ...WEDDING_SITE_CONTENT },
    0
  ) as Doc<'weddingSites'>;

  return {
    guests,
    vendorCategories,
    vendors,
    budgetCategories,
    budgetLineItems,
    targetBudget: DEMO_TARGET_BUDGET,
    tasks,
    notes,
    timelineItems,
    weddingSite,
  };
}
