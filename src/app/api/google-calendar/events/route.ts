import { NextResponse } from 'next/server';
import ICAL from 'ical.js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { CALENDAR_DEFAULT_COLOR, type GoogleCalendarEntry } from '@/lib/types';

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
  calendarId: string;
  calendarName: string;
  color: string;
}

interface SettingBody {
  url?: string;
  calendars?: unknown;
}

/**
 * Normalize the stored setting body into a list of calendar entries.
 * Supports both the legacy `{ url }` shape and the new `{ calendars: [...] }`
 * shape. Returns [] when nothing is configured.
 */
function readCalendarEntries(body: SettingBody | null): GoogleCalendarEntry[] {
  if (!body) return [];
  if (Array.isArray(body.calendars)) {
    const out: GoogleCalendarEntry[] = [];
    for (const raw of body.calendars) {
      if (!raw || typeof raw !== 'object') continue;
      const e = raw as Partial<GoogleCalendarEntry>;
      if (typeof e.url !== 'string' || !e.url) continue;
      out.push({
        id: typeof e.id === 'string' && e.id ? e.id : Math.random().toString(36).slice(2),
        name: typeof e.name === 'string' && e.name ? e.name : 'Google Calendar',
        url: e.url,
        color: typeof e.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : CALENDAR_DEFAULT_COLOR,
      });
    }
    return out;
  }
  if (typeof body.url === 'string' && body.url) {
    return [{
      id: 'legacy',
      name: 'Google Calendar',
      url: body.url,
      color: CALENDAR_DEFAULT_COLOR,
    }];
  }
  return [];
}

async function fetchIcs(url: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FamLi Hub/1.0 (calendar import)' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'fetch failed' };
  }
}

/**
 * Parse an ICS body into event objects scoped to [startDate, endDate], tagged
 * with the owning calendar's id, name, and color.
 */
function parseIcs(icsText: string, entry: GoogleCalendarEntry, startDate: Date, endDate: Date): OutEvent[] {
  const events: OutEvent[] = [];
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  const windowStart = ICAL.Time.fromJSDate(startDate, true);
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
      try {
        const iterator = ev.iterator();
        let occ: ICAL.Time | null;
        let safety = 5000;
        // eslint-disable-next-line no-cond-assign
        while ((occ = iterator.next()) && safety-- > 0) {
          if (occ.compare(windowEnd) > 0) break;
          if (occ.compare(windowStart) < 0) continue;
          const occStart = occ.toJSDate();
          const occEnd = new Date(occStart.getTime() + baseDurationMs);
          events.push({
            uid: `${entry.id}:${uidBase}-${occStart.toISOString()}`,
            title: summary,
            start: occStart.toISOString(),
            end: occEnd.toISOString(),
            allDay,
            location,
            description,
            calendarId: entry.id,
            calendarName: entry.name,
            color: entry.color,
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
          uid: `${entry.id}:${uidBase}`,
          title: summary,
          start: s.toISOString(),
          end: e.toISOString(),
          allDay,
          location,
          description,
          calendarId: entry.id,
          calendarName: entry.name,
          color: entry.color,
        });
      }
    }
  }

  return events;
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

  // Validate the caller.
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

  // Load the user's connected calendars (legacy or new shape).
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

  const entries = readCalendarEntries(settings?.body as SettingBody | null);
  if (entries.length === 0) {
    return NextResponse.json({ events: [], connected: false, calendars: [] });
  }

  // Fetch all calendars in parallel. Per-calendar failures become per-calendar
  // error messages; other calendars still succeed.
  type FetchOk = { ok: true; entry: GoogleCalendarEntry; events: OutEvent[] };
  type FetchFail = { ok: false; entry: GoogleCalendarEntry; error: string };
  const fetched: Array<FetchOk | FetchFail> = await Promise.all(entries.map(async entry => {
    const validated = isAllowedGoogleIcal(entry.url);
    if (!validated) {
      return { ok: false, entry, error: 'Invalid URL host — not a Google Calendar iCal feed.' } as FetchFail;
    }
    const res = await fetchIcs(validated);
    if (!res.ok) {
      return { ok: false, entry, error: `Google fetch failed: ${res.message}` } as FetchFail;
    }
    try {
      const evs = parseIcs(res.text, entry, startDate, endDate);
      return { ok: true, entry, events: evs } as FetchOk;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'parse failed';
      return { ok: false, entry, error: `Parse failed: ${message}` } as FetchFail;
    }
  }));

  const events: OutEvent[] = [];
  const calendarStatuses: Array<{ id: string; name: string; color: string; error?: string; count: number }> = [];
  for (const f of fetched) {
    if (f.ok) {
      events.push(...f.events);
      calendarStatuses.push({ id: f.entry.id, name: f.entry.name, color: f.entry.color, count: f.events.length });
    } else {
      calendarStatuses.push({ id: f.entry.id, name: f.entry.name, color: f.entry.color, error: f.error, count: 0 });
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return NextResponse.json({
    events,
    connected: true,
    calendars: calendarStatuses,
  });
}
