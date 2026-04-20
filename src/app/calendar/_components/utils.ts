import { CALENDAR_COLOR_PALETTE, CALENDAR_DEFAULT_COLOR, type GoogleCalendarEntry } from '@/lib/types';

export interface GoogleEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  htmlLink?: string;
  calendarId: string;
  calendarName: string;
  color: string;
}

export interface CalendarStatus {
  id: string;
  name: string;
  color: string;
  count: number;
  error?: string;
}

export interface SettingRow {
  id: string;
  body: { url?: string; calendars?: unknown };
}

export const GOOGLE_SETTING_TITLE = 'google_ical_url';
export const VIEW_STORAGE_KEY = 'famli.calendarView';
export type ViewMode = 'month' | 'day' | 'agenda';

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDayLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function fmtDayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
}

export function isGoogleIcalUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === 'https:' && u.hostname === 'calendar.google.com' && u.pathname.startsWith('/calendar/ical/');
  } catch {
    return false;
  }
}

/** 15%-opacity rgba tint of a #RRGGBB color for all-day pill backgrounds. */
export function tintFor(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'rgba(66,133,244,0.15)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

export function newEntryId(): string {
  return `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Read the stored setting row into a list of entries; handles legacy shape. */
export function entriesFromSetting(setting: SettingRow | null): GoogleCalendarEntry[] {
  if (!setting?.body) return [];
  const body = setting.body;
  if (Array.isArray(body.calendars)) {
    const raw = body.calendars as unknown[];
    const out: GoogleCalendarEntry[] = [];
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue;
      const e = r as Partial<GoogleCalendarEntry>;
      if (typeof e.url !== 'string' || !e.url) continue;
      out.push({
        id: typeof e.id === 'string' && e.id ? e.id : newEntryId(),
        name: typeof e.name === 'string' && e.name ? e.name : 'Google Calendar',
        url: e.url,
        color: typeof e.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : CALENDAR_DEFAULT_COLOR,
      });
    }
    return out;
  }
  if (typeof body.url === 'string' && body.url) {
    return [{ id: 'legacy', name: 'Google Calendar', url: body.url, color: CALENDAR_DEFAULT_COLOR }];
  }
  return [];
}

export function nextUnusedColor(existing: GoogleCalendarEntry[]): string {
  const used = new Set(existing.map(e => e.color.toLowerCase()));
  for (const c of CALENDAR_COLOR_PALETTE) if (!used.has(c.toLowerCase())) return c;
  return CALENDAR_COLOR_PALETTE[existing.length % CALENDAR_COLOR_PALETTE.length];
}
