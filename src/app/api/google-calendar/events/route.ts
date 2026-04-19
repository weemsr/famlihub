import { NextResponse } from 'next/server';
import ICAL from 'ical.js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only allow Google Calendar's iCal feed host — prevents SSRF.
function isAllowedGoogleIcal(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'calendar.google.com') return null;
    if (!u.pathname.startsWith('/calendar/ical/')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

interface OutEvent {
  uid: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  allDay: boolean;
  location?: string;
  description?: string;
  htmlLink?: string;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const jwt = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1];
  if (!jwt) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  const url = new URL(req.url);
  const rangeStart = url.searchParams.get('start');
  const rangeEnd = url.searchParams.get('end');
  if (!rangeStart || !rangeEnd) {
    return NextResponse.json({ error: 'start and end query params are required (ISO dates)' }, { status: 400 });
  }

  const startDate = new Date(rangeStart);
  const endDate = new Date(rangeEnd);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
    return NextResponse.json({ error: 'Invalid start/end' }, { status: 400 });
  }
  const maxMs = 120 * 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > maxMs) {
    return NextResponse.json({ error: 'Range too large (max 120 days)' }, { status: 400 });
  }

  // Validate the caller and fetch their stored Google iCal URL.
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

  const admin = getSupabaseAdmin();
  const { data: settings, error: settingsErr } = await admin
    .from('items')
    .select('body')
    .eq('user_id', userId)
    .eq('type', 'setting')
    .eq('title', 'google_ical_url')
    .maybeSingle();
  if (settingsErr) {
    return NextResponse.json({ error: settingsErr.message }, { status: 500 });
  }

  const storedUrl = (settings?.body as { url?: string } | null)?.url;
  if (!storedUrl) {
    return NextResponse.json({ events: [], connected: false });
  }

  const validated = isAllowedGoogleIcal(storedUrl);
  if (!validated) {
    return NextResponse.json({ error: 'Stored URL is not a valid Google Calendar iCal URL.' }, { status: 400 });
  }

  // Fetch the ICS feed text.
  let icsText: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(validated, {
      headers: { 'User-Agent': 'FamLi Hub/1.0 (calendar import)' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return NextResponse.json({ error: `Google returned ${res.status} — check the URL is still valid.` }, { status: 502 });
    }
    icsText = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Google calendar';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Parse with ical.js and expand recurring events in the requested window.
  const events: OutEvent[] = [];

  try {
    const jcal = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');

    const windowStart = ICAL.Time.fromJSDate(startDate, true); // true = UTC
    const windowEnd = ICAL.Time.fromJSDate(endDate, true);

    for (const v of vevents) {
      let ev: ICAL.Event;
      try {
        ev = new ICAL.Event(v);
      } catch {
        continue;
      }

      if (!ev.startDate) continue;

      const summary = ev.summary || '';
      const location = ev.location || undefined;
      const description = ev.description || undefined;
      const uidBase = ev.uid || Math.random().toString(36).slice(2);
      const allDay = ev.startDate.isDate;

      const baseDurationMs = ev.endDate && ev.startDate
        ? Math.max(0, ev.endDate.toJSDate().getTime() - ev.startDate.toJSDate().getTime())
        : 0;

      if (ev.isRecurring()) {
        // Expand occurrences from the start of our window.
        try {
          const iterator = ev.iterator();
          let occ: ICAL.Time | null;
          // Hard cap to avoid runaway iterators on broken calendars.
          let safety = 5000;
          // eslint-disable-next-line no-cond-assign
          while ((occ = iterator.next()) && safety-- > 0) {
            if (occ.compare(windowEnd) > 0) break;
            if (occ.compare(windowStart) < 0) continue;
            const occStart = occ.toJSDate();
            const occEnd = new Date(occStart.getTime() + baseDurationMs);
            events.push({
              uid: `${uidBase}-${occStart.toISOString()}`,
              title: summary,
              start: occStart.toISOString(),
              end: occEnd.toISOString(),
              allDay,
              location,
              description,
            });
          }
        } catch {
          // Skip this event if RRULE can't be expanded.
        }
      } else {
        const s = ev.startDate.toJSDate();
        const e = ev.endDate ? ev.endDate.toJSDate() : new Date(s.getTime() + baseDurationMs);
        if (e >= startDate && s <= endDate) {
          events.push({
            uid: uidBase,
            title: summary,
            start: s.toISOString(),
            end: e.toISOString(),
            allDay,
            location,
            description,
          });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse calendar';
    return NextResponse.json({ error: `Couldn't parse the calendar feed: ${message}` }, { status: 502 });
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return NextResponse.json({ events, connected: true });
}
