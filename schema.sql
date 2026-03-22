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

-- Since this is a shared family app, we will let any logged-in family member access all items.
CREATE POLICY "Family can read all items" 
  ON items FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Family can insert items" 
  ON items FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Family can update items" 
  ON items FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Family can delete items" 
  ON items FOR DELETE USING (auth.role() = 'authenticated');
