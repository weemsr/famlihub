import { NextResponse } from 'next/server';
import ical, { type CalendarComponent, type VEvent } from 'node-ical';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// node-ical hands recurring events back as an rrule instance; we only need
// the .between() method so we keep a loose structural type instead of
// taking a direct dependency on rrule-temporal.
interface RecurrenceRule {
  between(start: Date, end: Date, inclusive?: boolean): Date[];
}

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

function toIso(d: Date): string {
  return d.toISOString();
}

function isVEvent(c: CalendarComponent): c is VEvent {
  return c.type === 'VEVENT';
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const jwt = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1];
  if (!jwt) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  const url = new URL(req.url);
  const rangeStart = url.searchParams.get('start'); // ISO
  const rangeEnd = url.searchParams.get('end');     // ISO
  if (!rangeStart || !rangeEnd) {
    return NextResponse.json({ error: 'start and end query params are required (ISO dates)' }, { status: 400 });
  }

  const startDate = new Date(rangeStart);
  const endDate = new Date(rangeEnd);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
    return NextResponse.json({ error: 'Invalid start/end' }, { status: 400 });
  }
  // Hard cap — no more than 120 days at a time.
  const maxMs = 120 * 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > maxMs) {
    return NextResponse.json({ error: 'Range too large (max 120 days)' }, { status: 400 });
  }

  // Validate the caller and look up their stored Google iCal URL.
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

  // Fetch + parse the Google ICS feed.
  let parsed: Record<string, CalendarComponent>;
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
    const text = await res.text();
    parsed = ical.async.parseICS(text) as unknown as Record<string, CalendarComponent>;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Google calendar';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const events: OutEvent[] = [];

  for (const k of Object.keys(parsed)) {
    const ev = parsed[k];
    if (!isVEvent(ev)) continue;

    const summary = typeof ev.summary === 'string' ? ev.summary : '';
    const location = typeof ev.location === 'string' ? ev.location : undefined;
    const description = typeof ev.description === 'string' ? ev.description : undefined;
    const htmlLink = (ev as unknown as { url?: string }).url;

    // Detect whether this event is all-day. node-ical exposes .datetype === 'date'
    // for DATE values (no time); use a defensive check.
    const rawStartType = (ev.start as unknown as { dateOnly?: boolean; datetype?: string })?.datetype;
    const allDay = rawStartType === 'date';

    const start = ev.start instanceof Date ? ev.start : new Date(ev.start as unknown as string | number);
    const end = ev.end instanceof Date ? ev.end : new Date((ev.end as unknown as string | number) ?? start);
    if (isNaN(start.getTime())) continue;

    const baseDurationMs = Math.max(0, end.getTime() - start.getTime());

    // Build the list of excluded dates (EXDATE) if any.
    const exceptions = new Set<string>();
    const exdate = (ev as unknown as { exdate?: Record<string, Date> }).exdate;
    if (exdate) {
      for (const key of Object.keys(exdate)) {
        const d = exdate[key];
        if (d instanceof Date) exceptions.add(d.toISOString().slice(0, 10));
      }
    }

    if (ev.rrule) {
      // Recurring: expand to all instances inside the requested window.
      let rruleInstances: Date[] = [];
      try {
        const rule = ev.rrule as unknown as RecurrenceRule;
        rruleInstances = rule.between(startDate, endDate, true);
      } catch {
        rruleInstances = [];
      }

      for (const occ of rruleInstances) {
        const occIso = occ.toISOString().slice(0, 10);
        if (exceptions.has(occIso)) continue;
        const occEnd = new Date(occ.getTime() + baseDurationMs);
        events.push({
          uid: `${ev.uid}-${occ.toISOString()}`,
          title: summary,
          start: toIso(occ),
          end: toIso(occEnd),
          allDay,
          location,
          description,
          htmlLink,
        });
      }
    } else {
      // Single occurrence: keep if it overlaps the window.
      if (end >= startDate && start <= endDate) {
        events.push({
          uid: String(ev.uid || k),
          title: summary,
          start: toIso(start),
          end: toIso(end),
          allDay,
          location,
          description,
          htmlLink,
        });
      }
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return NextResponse.json({ events, connected: true });
}
