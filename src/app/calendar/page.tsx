"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Info, Link2, RefreshCw, ExternalLink,
  MapPin, X, Trash2, Pencil, Check, Plus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  CALENDAR_COLOR_PALETTE,
  CALENDAR_DEFAULT_COLOR,
  type GoogleCalendarEntry,
} from '@/lib/types';

interface GoogleEvent {
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

interface CalendarStatus {
  id: string;
  name: string;
  color: string;
  count: number;
  error?: string;
}

interface SettingRow {
  id: string;
  body: { url?: string; calendars?: unknown };
}

const GOOGLE_SETTING_TITLE = 'google_ical_url';
const VIEW_STORAGE_KEY = 'famli.calendarView';
type ViewMode = 'month' | 'day' | 'agenda';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDayLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtDayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
}

function isGoogleIcalUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === 'https:' && u.hostname === 'calendar.google.com' && u.pathname.startsWith('/calendar/ical/');
  } catch {
    return false;
  }
}

/** 15%-opacity rgba tint of a #RRGGBB color for all-day pill backgrounds. */
function tintFor(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'rgba(66,133,244,0.15)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

function newEntryId(): string {
  return `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Read the stored setting row into a list of entries; handles legacy shape. */
function entriesFromSetting(setting: SettingRow | null): GoogleCalendarEntry[] {
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

function nextUnusedColor(existing: GoogleCalendarEntry[]): string {
  const used = new Set(existing.map(e => e.color.toLowerCase()));
  for (const c of CALENDAR_COLOR_PALETTE) if (!used.has(c.toLowerCase())) return c;
  return CALENDAR_COLOR_PALETTE[existing.length % CALENDAR_COLOR_PALETTE.length];
}

export default function CalendarPage() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = isoDay(today);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [dayViewDate, setDayViewDate] = useState<string>(todayIso);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Load persisted view preference after mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === 'month' || v === 'day' || v === 'agenda') setViewMode(v);
    } catch { /* ignore */ }
  }, []);
  const pickView = (v: ViewMode) => {
    setViewMode(v);
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* ignore */ }
  };

  // Calendar data
  const [googleSetting, setGoogleSetting] = useState<SettingRow | null>(null);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [calendarStatuses, setCalendarStatuses] = useState<CalendarStatus[]>([]);
  const [googleFetching, setGoogleFetching] = useState(false);
  const [googleFetchError, setGoogleFetchError] = useState<string | null>(null);

  // Add-calendar form state
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(CALENDAR_DEFAULT_COLOR);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [showGcalHow, setShowGcalHow] = useState(false);

  // Inline-edit state (one entry at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(CALENDAR_DEFAULT_COLOR);

  const entries = useMemo(() => entriesFromSetting(googleSetting), [googleSetting]);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const res = await supabase
      .from('items')
      .select('id,body')
      .eq('type', 'setting')
      .eq('title', GOOGLE_SETTING_TITLE)
      .maybeSingle();
    if (res.data) setGoogleSetting(res.data as unknown as SettingRow);
    else setGoogleSetting(null);
  }, []);

  const loadRef = useRef(loadData);
  useEffect(() => { loadRef.current = loadData; }, [loadData]);

  useEffect(() => {
    loadRef.current();
    const channel = supabase
      .channel('realtime:calendar')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: 'type=eq.setting' },
        () => loadRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch events whenever the month/day under view changes or entries change.
  const fetchGoogleEvents = useCallback(async () => {
    if (entries.length === 0) {
      setGoogleEvents([]);
      setCalendarStatuses([]);
      return;
    }
    setGoogleFetching(true);
    setGoogleFetchError(null);

    // Window covers whichever view we might render. Use current month view's
    // span (first of month → end of next month) which is always a superset of
    // day view (single day) and agenda view (next 14 days).
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0);

    const { data: sess } = await supabase.auth.getSession();
    const jwt = sess.session?.access_token;
    if (!jwt) { setGoogleFetching(false); return; }

    try {
      const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      const res = await fetch(`/api/google-calendar/events?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const json = (await res.json()) as {
        events?: GoogleEvent[]; calendars?: CalendarStatus[]; error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setGoogleEvents(json.events || []);
      setCalendarStatuses(json.calendars || []);
    } catch (err) {
      setGoogleFetchError(err instanceof Error ? err.message : 'Failed to load Google events');
    } finally {
      setGoogleFetching(false);
    }
  }, [entries, cursor]);

  useEffect(() => { fetchGoogleEvents(); }, [fetchGoogleEvents]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, GoogleEvent[]>();
    for (const ev of googleEvents) {
      const key = isoDay(new Date(ev.start));
      const list = m.get(key);
      if (list) list.push(ev); else m.set(key, [ev]);
    }
    for (const [, list] of m) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start < b.start ? -1 : 1;
      });
    }
    return m;
  }, [googleEvents]);

  // ---- Save / edit helpers for the entry list ----

  const persistEntries = async (next: GoogleCalendarEntry[]) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not signed in');
    if (googleSetting) {
      const { error } = await supabase
        .from('items')
        .update({ body: { calendars: next } })
        .eq('id', googleSetting.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('items').insert({
        type: 'setting',
        title: GOOGLE_SETTING_TITLE,
        body: { calendars: next },
        user_id: userData.user.id,
      });
      if (error) throw error;
    }
    await loadData();
  };

  const saveAdd = async () => {
    const url = newUrl.trim();
    if (!isGoogleIcalUrl(url)) {
      setAddError("That doesn't look like a Google Calendar secret iCal URL. It should start with https://calendar.google.com/calendar/ical/");
      return;
    }
    setAddError(null);
    setAddSaving(true);
    try {
      const entry: GoogleCalendarEntry = {
        id: newEntryId(),
        name: newName.trim() || 'Google Calendar',
        url,
        color: newColor,
      };
      await persistEntries([...entries, entry]);
      setNewUrl(''); setNewName(''); setShowAdd(false);
      setNewColor(nextUnusedColor([...entries, entry]));
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setAddSaving(false);
    }
  };

  const removeEntry = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Remove this calendar? Events from it will disappear.')) return;
    const next = entries.filter(e => e.id !== id);
    try { await persistEntries(next); } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
  };

  const startEditEntry = (entry: GoogleCalendarEntry) => {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditColor(entry.color);
  };

  const saveEditEntry = async () => {
    if (!editingId) return;
    const next = entries.map(e => e.id === editingId ? { ...e, name: editName.trim() || e.name, color: editColor } : e);
    try { await persistEntries(next); setEditingId(null); }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
  };

  // ---- Rendering helpers ----

  const onAddBarShow = () => {
    setShowAdd(true);
    setNewColor(nextUnusedColor(entries));
  };

  const renderEventRow = (ev: GoogleEvent) => {
    if (ev.allDay) {
      return (
        <div
          key={ev.uid}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            background: tintFor(ev.color),
            borderLeft: `4px solid ${ev.color}`,
          }}
        >
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: ev.color, letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0 }}>
            All day
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {ev.htmlLink ? (
              <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {ev.title || '(no title)'}
                <ExternalLink size={12} style={{ opacity: 0.5 }} />
              </a>
            ) : (
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{ev.title || '(no title)'}</span>
            )}
            {ev.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <MapPin size={12} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location}</span>
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2, fontWeight: 600 }}>
              {ev.calendarName}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div
        key={ev.uid}
        style={{
          display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10,
          background: 'var(--surface-hover)',
          alignItems: 'flex-start',
          borderLeft: `4px solid ${ev.color}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 64, flexShrink: 0 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: ev.color, letterSpacing: 0.3 }}>
            {fmtTime(ev.start)}
          </span>
          {ev.end && ev.end !== ev.start && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {fmtTime(ev.end)}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {ev.htmlLink ? (
            <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {ev.title || '(no title)'}
              <ExternalLink size={12} style={{ opacity: 0.5 }} />
            </a>
          ) : (
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{ev.title || '(no title)'}</span>
          )}
          {ev.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <MapPin size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location}</span>
            </div>
          )}
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2, fontWeight: 600 }}>
            {ev.calendarName}
          </div>
        </div>
      </div>
    );
  };

  // ---- Month grid ----

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ iso: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ iso: isoDay(new Date(year, month, d)), dayNum: d });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: null, dayNum: null });
    return cells;
  }, [cursor]);

  const monthLabel = cursor.toLocaleString('default', { month: 'long', year: 'numeric' });
  const prevMonth = () => { setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)); setSelectedDay(null); };
  const nextMonth = () => { setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)); setSelectedDay(null); };

  // ---- Agenda (next 14 days) ----

  const upcoming = useMemo(() => {
    const result: Array<{ iso: string; events: GoogleEvent[] }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = isoDay(d);
      const dayEvents = eventsByDay.get(iso) || [];
      if (dayEvents.length) result.push({ iso, events: dayEvents });
    }
    return result;
  }, [today, eventsByDay]);

  // ---- Day view ----

  const dayViewEvents = eventsByDay.get(dayViewDate) || [];
  const dayViewLabel = dayViewDate === todayIso ? `Today · ${fmtDayShort(dayViewDate)}` : fmtDayLong(dayViewDate);
  const shiftDayView = (days: number) => {
    const [y, m, d] = dayViewDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const nextIso = isoDay(dt);
    setDayViewDate(nextIso);
    // Keep the month cursor in sync so the API window is right.
    setCursor(new Date(dt.getFullYear(), dt.getMonth(), 1));
  };

  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(null);
    setDayViewDate(todayIso);
  };

  // Selected-day events (inline under month grid)
  const selectedDayEvents: GoogleEvent[] = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

  const hasAnyCalendar = entries.length > 0;
  const totalEvents = googleEvents.length;

  // ---- UI ----

  return (
    <div style={{ paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 24px)' }}>
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ marginBottom: 0 }}>Calendar 📆</h1>
        <button
          type="button"
          onClick={goToday}
          className="btn"
          style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: 999, background: 'var(--surface-hover)', color: 'var(--text-primary)', touchAction: 'manipulation' }}
        >
          Today
        </button>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface-hover)', padding: 4, borderRadius: 999, marginBottom: 16 }}>
        {(['month', 'day', 'agenda'] as const).map(v => {
          const active = viewMode === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => pickView(v)}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '0.88rem',
                fontWeight: 700,
                borderRadius: 999,
                background: active ? 'var(--surface-color)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: active ? '0 1px 4px var(--hairline-strong)' : 'none',
                border: 'none',
                cursor: 'pointer',
                touchAction: 'manipulation',
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          );
        })}
      </div>

      {/* ========= MONTH VIEW ========= */}
      {viewMode === 'month' && (
        <>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button type="button" onClick={prevMonth} aria-label="Previous month" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}>
                <ChevronLeft size={20} />
              </button>
              <h2 style={{ marginBottom: 0 }}>{monthLabel}</h2>
              <button type="button" onClick={nextMonth} aria-label="Next month" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}>
                <ChevronRight size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontWeight: 800, marginBottom: 6, fontSize: '0.76rem', color: 'var(--text-secondary)', letterSpacing: 0.6 }}>
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => <div key={d}>{d}</div>)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {grid.map((cell, i) => {
                if (!cell.iso || cell.dayNum === null) {
                  return <div key={`blank-${i}`} style={{ aspectRatio: '1 / 1' }} aria-hidden />;
                }
                const dayEvents = eventsByDay.get(cell.iso) || [];
                const isToday = cell.iso === todayIso;
                const isSelected = cell.iso === selectedDay;
                const count = dayEvents.length;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : cell.iso)}
                    aria-label={`${fmtDayLong(cell.iso)}${count ? `, ${count} event${count > 1 ? 's' : ''}` : ''}`}
                    aria-pressed={isSelected}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      maxHeight: 64,
                      padding: '5px 4px',
                      borderRadius: 10,
                      background: isToday ? 'var(--accent-color)' : 'var(--surface-hover)',
                      color: isToday ? 'white' : 'var(--text-primary)',
                      border: isSelected ? '2px solid var(--accent-color)' : '2px solid transparent',
                      outline: isSelected && isToday ? '2px solid var(--surface-color)' : 'none',
                      outlineOffset: isSelected && isToday ? '-4px' : '0',
                      fontWeight: isToday ? 700 : 500,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}
                  >
                    <span style={{ textAlign: 'center', lineHeight: 1.1 }}>{cell.dayNum}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 12, justifyContent: 'flex-end' }}>
                      {count > 0 && (
                        <>
                          {dayEvents.slice(0, 3).map((ev, idx) => (
                            <span
                              key={ev.uid + idx}
                              aria-hidden
                              style={{
                                height: 3,
                                borderRadius: 2,
                                background: isToday ? 'rgba(255,255,255,0.9)' : ev.color,
                                width: ev.allDay ? '100%' : '80%',
                                alignSelf: ev.allDay ? 'stretch' : 'center',
                                opacity: idx === 0 ? 1 : idx === 1 ? 0.8 : 0.6,
                              }}
                            />
                          ))}
                          {count > 3 && (
                            <span style={{
                              fontSize: '0.6rem',
                              fontWeight: 800,
                              color: isToday ? 'rgba(255,255,255,0.95)' : 'var(--text-secondary)',
                              lineHeight: 1,
                              textAlign: 'center',
                              marginTop: 1,
                            }}>+{count - 3}</span>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inline selected-day preview under the grid */}
          {selectedDay && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ marginBottom: 0 }}>
                  {selectedDay === todayIso ? `Today — ${fmtDayShort(selectedDay)}` : fmtDayLong(selectedDay)}
                </h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => { setDayViewDate(selectedDay); pickView('day'); }}
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', borderRadius: 999, touchAction: 'manipulation' }}
                  >
                    Open day →
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDay(null)}
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, touchAction: 'manipulation' }}
                  >
                    <X size={14} /> Clear
                  </button>
                </div>
              </div>
              {selectedDayEvents.length === 0
                ? <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing scheduled.</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{selectedDayEvents.map(renderEventRow)}</div>}
            </div>
          )}
        </>
      )}

      {/* ========= DAY VIEW ========= */}
      {viewMode === 'day' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button type="button" onClick={() => shiftDayView(-1)} aria-label="Previous day" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}>
              <ChevronLeft size={20} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{dayViewLabel}</div>
              {dayViewDate !== todayIso && (
                <button
                  type="button"
                  onClick={() => setDayViewDate(todayIso)}
                  style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-color)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', marginTop: 2 }}
                >
                  Jump to today
                </button>
              )}
            </div>
            <button type="button" onClick={() => shiftDayView(1)} aria-label="Next day" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}>
              <ChevronRight size={20} />
            </button>
          </div>

          {!hasAnyCalendar ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Connect a Google Calendar below to see your events here.</p>
          ) : dayViewEvents.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing scheduled for this day.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dayViewEvents.map(renderEventRow)}
            </div>
          )}
        </div>
      )}

      {/* ========= AGENDA VIEW ========= */}
      {viewMode === 'agenda' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
            <h3 style={{ marginBottom: 0 }}>Upcoming</h3>
            {hasAnyCalendar && (
              <button
                type="button"
                onClick={() => fetchGoogleEvents()}
                disabled={googleFetching}
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, touchAction: 'manipulation' }}
              >
                <RefreshCw size={14} /> {googleFetching ? '…' : 'Refresh'}
              </button>
            )}
          </div>

          {googleFetchError && (
            <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{googleFetchError}</p>
          )}

          {!hasAnyCalendar ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Connect a Google Calendar below to see your events here.
            </p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nothing in the next 14 days.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {upcoming.map(({ iso, events }) => (
                <div key={iso}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {iso === todayIso ? `Today · ${fmtDayShort(iso)}` : fmtDayShort(iso)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.map(renderEventRow)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========= CONNECTED CALENDARS ========= */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Link2 size={20} style={{ color: 'var(--accent-color)' }} />
          <h3 style={{ marginBottom: 0 }}>
            {hasAnyCalendar ? 'Connected calendars' : 'Show my Google Calendar here'}
          </h3>
        </div>

        {!hasAnyCalendar && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
            Paste your Google Calendar&apos;s secret iCal URL to start. You can add more calendars later — each gets its own color.
          </p>
        )}

        {/* Entry list */}
        {entries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {entries.map(entry => {
              const status = calendarStatuses.find(s => s.id === entry.id);
              const isEditing = editingId === entry.id;
              return (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px',
                    background: 'var(--surface-hover)',
                    borderRadius: 10,
                    borderLeft: `4px solid ${entry.color}`,
                  }}
                >
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                      <input
                        type="text"
                        className="input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="Calendar name"
                        style={{ padding: '8px 14px', fontSize: '0.9rem' }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {CALENDAR_COLOR_PALETTE.map(c => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Color ${c}`}
                            onClick={() => setEditColor(c)}
                            style={{
                              width: 26, height: 26, borderRadius: 999,
                              background: c,
                              border: editColor.toLowerCase() === c.toLowerCase() ? '3px solid var(--text-primary)' : '2px solid var(--hairline)',
                              cursor: 'pointer', touchAction: 'manipulation',
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn" onClick={saveEditEntry} style={{ width: 'auto', padding: '6px 14px', fontSize: '0.85rem', touchAction: 'manipulation' }}>
                          <Check size={14} /> Save
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ width: 'auto', padding: '6px 14px', fontSize: '0.85rem', touchAction: 'manipulation' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{entry.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {status?.error
                            ? <span style={{ color: 'var(--danger-color)' }}>Error: {status.error}</span>
                            : `${status?.count ?? 0} events`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => startEditEntry(entry)}
                          aria-label="Edit calendar"
                          style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', touchAction: 'manipulation' }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                          aria-label="Remove calendar"
                          style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', touchAction: 'manipulation' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add calendar */}
        {!showAdd ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onAddBarShow}
            style={{ width: 'auto', padding: '8px 16px', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6, touchAction: 'manipulation' }}
          >
            <Plus size={16} /> {hasAnyCalendar ? 'Add calendar' : 'Connect a calendar'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="input"
                placeholder="https://calendar.google.com/calendar/ical/..."
                value={newUrl}
                onChange={e => { setNewUrl(e.target.value); setAddError(null); }}
                style={{ fontSize: '0.85rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '10px 14px' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0 16px', width: 'auto', fontSize: '13px', touchAction: 'manipulation' }}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    setNewUrl(text.trim());
                    setAddError(null);
                  } catch (err) {
                    console.error('Clipboard error', err);
                    setAddError("Couldn't read clipboard. Paste manually instead.");
                  }
                }}
                disabled={addSaving}
              >
                Paste 📋
              </button>
            </div>
            <input
              type="text"
              className="input"
              placeholder="Label (e.g., Work, Mom, Kids)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ padding: '10px 14px', fontSize: '0.9rem' }}
            />
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Color</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CALENDAR_COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => setNewColor(c)}
                    style={{
                      width: 30, height: 30, borderRadius: 999,
                      background: c,
                      border: newColor.toLowerCase() === c.toLowerCase() ? '3px solid var(--text-primary)' : '2px solid var(--hairline)',
                      cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  />
                ))}
              </div>
            </div>
            {addError && (
              <p className="text-sm" style={{ color: 'var(--danger-color)' }}>{addError}</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={saveAdd}
                disabled={addSaving || !newUrl.trim()}
                style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
              >
                {addSaving ? 'Saving…' : 'Add calendar'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowAdd(false); setNewUrl(''); setNewName(''); setAddError(null); }}
                style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Footer + total status */}
        {hasAnyCalendar && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {totalEvents} events loaded for this view.
            </span>
            <button
              type="button"
              onClick={() => fetchGoogleEvents()}
              disabled={googleFetching}
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '6px 12px', fontSize: '0.82rem', touchAction: 'manipulation', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={14} /> {googleFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowGcalHow(v => !v)}
          style={{ marginTop: 12, background: 'transparent', border: 'none', padding: 0, color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Info size={14} /> {showGcalHow ? 'Hide instructions' : 'Where do I find this URL?'}
        </button>

        {showGcalHow && (
          <ol style={{ marginTop: 10, marginBottom: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Google Calendar</a> on a desktop.</li>
            <li>In the left sidebar under <em>My calendars</em>, hover over the calendar you want to see, click the <strong>⋮</strong> (three dots), then <strong>Settings and sharing</strong>.</li>
            <li>Scroll down to <strong>Integrate calendar</strong>.</li>
            <li>Copy the URL labeled <strong>Secret address in iCal format</strong> (not the Public one).</li>
            <li>Paste it above, pick a label + color, and click Add calendar.</li>
          </ol>
        )}

        <p className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: 14, marginBottom: 0, fontSize: '0.78rem' }}>
          These URLs are private — keep them out of shared channels. They&apos;re used only by FamLi&apos;s server to fetch events.
        </p>
      </div>

    </div>
  );
}
