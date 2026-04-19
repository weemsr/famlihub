/**
 * Service-role Supabase client. Bypasses RLS — must only be used server-side,
 * and every query must manually filter by user_id. Never import from client
 * components.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
