-- FamLi Hub schema. Run this in your Supabase SQL Editor.
--
-- Safe to re-run: every statement is guarded, and nothing here deletes or
-- rewrites rows. Existing installs should re-run it to pick up section 4
-- (Realtime), which the app has always depended on but this file never set up.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id uuid default gen_random_uuid() primary key,
  type text not null, -- 'todo', 'grocery', 'recipe', 'note', 'meal', 'inventory',
                      -- 'maintenance', 'credit-card', 'setting'
  title text not null,
  body jsonb, -- shape depends on `type`; see src/lib/types.ts
  is_completed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  -- NOT NULL matters: a row with a null user_id satisfies no RLS policy, so it
  -- is invisible and uneditable from the app but still counts against storage.
  user_id uuid not null references auth.users(id)
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Row-level security — each user only ever sees their own rows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own items" ON items;
CREATE POLICY "Users can read own items"
  ON items FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own items" ON items;
CREATE POLICY "Users can insert own items"
  ON items FOR INSERT WITH CHECK (auth.uid() = user_id);

-- WITH CHECK is spelled out so an update can't reassign a row to another user.
-- (Postgres would default it to the USING clause, but relying on that is
-- easy to misread.)
DROP POLICY IF EXISTS "Users can update own items" ON items;
CREATE POLICY "Users can update own items"
  ON items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own items" ON items;
CREATE POLICY "Users can delete own items"
  ON items FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Index
-- ---------------------------------------------------------------------------
-- Every list page filters by (user_id, type). Composite index keeps those
-- queries index-only as the table grows. Safe to add to a populated table —
-- Postgres does an ACCESS SHARE lock, rows are not touched or rewritten.
CREATE INDEX IF NOT EXISTS items_user_id_type_idx
  ON items (user_id, type);

-- ---------------------------------------------------------------------------
-- 4. Realtime  (required — the app breaks quietly without it)
-- ---------------------------------------------------------------------------
-- Every page subscribes to postgres_changes on `items` so edits from another
-- device show up live. A new Supabase project's supabase_realtime publication
-- is empty, so without this the subscriptions connect, report success, and
-- simply never fire — the app still loads data on mount, which is why the
-- omission is easy to miss.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'No supabase_realtime publication found. Turn on Realtime for this project, then re-run this file.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
    RAISE NOTICE 'Added public.items to the supabase_realtime publication.';
  END IF;
END
$$;

-- DELETE events otherwise carry only the primary key, so subscribers can't see
-- which `type` was removed. The home dashboard reads payload.old.type to decide
-- whether to refresh the calendar card, so it needs the full old row.
ALTER TABLE items REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 5. Migration for installs created before the constraints above
-- ---------------------------------------------------------------------------
-- Read-only if your data is already clean. It never deletes anything: if any
-- rows have a null user_id it reports the count and leaves them alone, so you
-- can decide what to do with them.
DO $$
DECLARE orphaned bigint;
BEGIN
  SELECT count(*) INTO orphaned FROM public.items WHERE user_id IS NULL;
  IF orphaned > 0 THEN
    RAISE NOTICE 'Left items.user_id nullable: % row(s) have no user_id. They are invisible to every RLS policy. Inspect with:  SELECT id, type, title FROM items WHERE user_id IS NULL;  then assign or remove them and re-run.', orphaned;
  ELSE
    ALTER TABLE public.items ALTER COLUMN user_id SET NOT NULL;
  END IF;
END
$$;

-- Optional, and deliberately NOT enabled by default: with ON DELETE CASCADE,
-- deleting a user from auth.users also deletes every one of their items. As it
-- stands the foreign key refuses that delete instead, which is the safer
-- default. Uncomment only if you want account deletion to take the data with it.
--
-- ALTER TABLE public.items DROP CONSTRAINT items_user_id_fkey;
-- ALTER TABLE public.items ADD CONSTRAINT items_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
