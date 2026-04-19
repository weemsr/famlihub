# FamLi Hub

A personal family-management web app: shared groceries, recipe book with URL
importer, meal planner, to-do, whiteboard notes, pantry inventory, and a
calendar that can sync to Google Calendar.

Built with [Next.js 16](https://nextjs.org) (App Router, Turbopack),
[React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org),
and [Supabase](https://supabase.com) (Postgres + Auth + Realtime).

## Stack

- **Next.js 16** (App Router, server actions, route handlers)
- **React 19**
- **Supabase** — Postgres, email/password auth, Realtime
- **Cheerio** — server-side recipe page parsing
- **lucide-react** — icons

## Local setup

```bash
git clone <this-repo>
cd Antigravity
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Environment

| Variable                        | Visibility  | Description                                                   |
| ------------------------------- | ----------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client      | Supabase project URL (Project Settings → API).                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client      | Supabase publishable/anon key.                                |
| `SUPABASE_SERVICE_ROLE_KEY`     | server-only | Service-role JWT. Used by the ICS feed route.                 |
| `CALENDAR_SIGNING_SECRET`       | server-only | HMAC secret for per-user calendar-feed URLs (32+ bytes).      |

Generate a `CALENDAR_SIGNING_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Rotating `CALENDAR_SIGNING_SECRET` invalidates every previously issued feed
URL** — use this if a URL leaks. Users will need to re-paste their URL into
Google Calendar after a rotation.

## Database

A single `items` table with a polymorphic `type` + JSONB `body` design, plus
per-user row-level security. Full schema + RLS policies are in
[`schema.sql`](./schema.sql). Run it in the Supabase SQL editor before first
use.

Each signed-in user only sees their own rows (`auth.uid() = user_id`).

## Google Calendar sync

Two independent paths, neither requires Google Cloud Console:

1. **ICS subscription (set-and-forget).** The Calendar tab shows a "Sync with
   Google Calendar" card with a personal feed URL:
   `https://famlihub.vercel.app/api/calendar/<token>.ics`. Paste it into
   Google Calendar → *Other calendars* → *+* → *From URL*. Google refreshes
   the feed on its own schedule (often every several hours).

2. **Per-meal quick add.** Each scheduled meal has a Google Calendar icon
   button that opens a pre-filled event in Google Calendar — one click to
   confirm.

## Theming

Three-state theme toggle on the home page: **Light / Auto / Dark**. Default
is system preference (`prefers-color-scheme`). Override persists in
`localStorage.famli.theme`. A no-flash bootstrap script in the layout runs
before React hydrates so there's no light-flash for dark-mode users.

## Deploy

Via Vercel CLI:

```bash
npx vercel --prod
```

Make sure the four env vars above are set in the Vercel project (`vercel env
add`).

Production: [famlihub.vercel.app](https://famlihub.vercel.app)

## Layout

```
src/
  app/
    actions/recipe.ts         # Server action: fetch + parse recipe URLs
    api/
      calendar/[token]/        # ICS feed for a signed user token
      calendar-feed-url/       # Returns the signed feed URL for the caller
    calendar/                  # Month grid + upcoming meals + sync card
    groceries/                 # Regular / Costco / Asian lists
    inventory/                 # Pantry staples
    meals/                     # Weekly planner, 3 slots × 7 days
    notes/                     # Whiteboard notes
    recipes/                   # URL import, manual create, search
    todos/                     # 3-category to-do lists
    page.tsx                   # Home dashboard (real-time counts)
  components/
    AuthProvider.tsx           # Email/password sign-in gate
    BottomNav.tsx              # Mobile-first bottom nav
    ThemeToggle.tsx            # Light / Auto / Dark segmented control
  lib/
    supabase.ts                # Client-safe Supabase singleton (anon)
    supabase-admin.ts          # Server-only service-role client
    types.ts                   # Shared Item/body interfaces
    url.ts                     # URL safety helpers (image + link)
    ics.ts                     # RFC 5545 ICS generator for meals
    gcal-link.ts               # Google Calendar "create event" URL builder
    calendar-token.ts          # HMAC-signed per-user feed tokens
```

## Notes on PWA

The app has a web app manifest and iOS meta tags for "Add to Home Screen"
(standalone launch, theme-matched status bar). A service worker for offline
read of recipes is flagged as a future upgrade — Next.js 16 + Turbopack
integration is currently best handled as a dedicated pass.
