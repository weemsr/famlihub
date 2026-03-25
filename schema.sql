-- Run this exact code in your Supabase SQL Editor

CREATE TABLE items (
  id uuid default gen_random_uuid() primary key,
  type text not null, -- 'todo', 'grocery', 'recipe', 'note'
  title text not null,
  body jsonb, -- Used for recipes and notes
  is_completed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  user_id uuid references auth.users(id)
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Each user can only access their own items
CREATE POLICY "Users can read own items"
  ON items FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON items FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON items FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON items FOR DELETE USING (auth.uid() = user_id);
