import { createClient } from '@supabase/supabase-js';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// In production a missing URL/key is a deploy-time misconfiguration — fail
// loudly instead of silently booting against a dummy Supabase. In dev we
// still fall back so the app can render while you fill in .env.local.
if (process.env.NODE_ENV === 'production' && (!envUrl || !envKey)) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in production.'
  );
}

const supabaseUrl = envUrl || 'https://dummy.supabase.co';
const supabaseAnonKey = envKey || 'dummy_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
