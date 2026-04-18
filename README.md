# FamLi Hub

A personal family-management web app: shared groceries, recipe book with URL
importer, meal planner, to-do, whiteboard notes, and pantry inventory.

Built with [Next.js 16](https://nextjs.org) (App Router, Turbopack),
[React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org),
and [Supabase](https://supabase.com) (Postgres + Auth + Realtime).

## Stack

- **Next.js 16** (App Router, server actions)
- **React 19**
- **Supabase** — Postgres, email/password auth, Realtime
- **Cheerio** — server-side recipe page parsing
- **lucide-react** — icons

## Local setup

```bash
git clone <this-repo>
cd Antigravity
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Environment

| Variable                        | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (Project Settings → API). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key.                 |

## Database

A single `items` table with a polymorphic `type` + JSONB `body` design, plus
per-user row-level security. Full schema + RLS policies are in
[`schema.sql`](./schema.sql). Run it in the Supabase SQL editor before first
use.

Each signed-in user only sees their own rows (`auth.uid() = user_id`).

## Deploy

Pushed via the Vercel CLI:

```bash
npx vercel --prod
```

Production: [famlihub.vercel.app](https://famlihub.vercel.app)

## Layout

```
src/
  app/
    actions/recipe.ts     # Server action: fetch + parse recipe URLs
    calendar/             # Month-view calendar (placeholder)
    groceries/            # Regular / Costco / Asian lists
    inventory/            # Pantry staples
    meals/                # Weekly planner, 3 slots × 7 days
    notes/                # Whiteboard notes
    recipes/              # URL import, manual create, search
    todos/                # 3-category to-do lists
    page.tsx              # Home dashboard (real-time counts)
  components/
    AuthProvider.tsx      # Email/password sign-in gate
    BottomNav.tsx         # Mobile-first bottom nav
  lib/
    supabase.ts           # Supabase client singleton
    types.ts              # Shared Item/body interfaces
    url.ts                # URL safety helpers (image + link)
```
