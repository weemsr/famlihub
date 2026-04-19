import { NextResponse } from 'next/server';
import { signCalendarToken } from '@/lib/calendar-token';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Returns the signed calendar-feed URL for the caller. Client attaches its
 * Supabase JWT as `Authorization: Bearer <token>`; this endpoint validates
 * the JWT via the service-role client and returns a signed URL tied to the
 * user's id.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }
  const jwt = match[1];

  let userId: string;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    userId = data.user.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let token: string;
  try {
    token = signCalendarToken(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // The origin comes from the request so it works on localhost, previews, and production.
  const url = new URL(req.url);
  const feedUrl = `${url.origin}/api/calendar/${token}.ics`;

  return NextResponse.json({ url: feedUrl });
}
