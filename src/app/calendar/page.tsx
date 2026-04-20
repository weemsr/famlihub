"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, X, CalendarDays,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type GoogleCalendarEntry } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import EventRow from './_components/EventRow';
import UpcomingList from './_components/UpcomingList';
import MonthGrid from './_components/MonthGrid';
import CalendarConnectionsPanel from './_components/CalendarConnectionsPanel';
import {
  GOOGLE_SETTING_TITLE,
  VIEW_STORAGE_KEY,
  entriesFromSetting,
  fmtDayLong,
  fmtDayShort,
  isoDay,
  type CalendarStatus,
  type GoogleEvent,
  type SettingRow,
  type ViewMode,
} from './_components/utils';

export default function CalendarPage() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = isoDay(today);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [dayViewDate, setDayViewDate] = useState<string>(todayIso);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  const [googleSetting, setGoogleSetting] = useState<SettingRow | null>(null);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [calendarStatuses, setCalendarStatuses] = useState<CalendarStatus[]>([]);
  const [googleFetching, setGoogleFetching] = useState(false);
  const [googleFetchError, setGoogleFetchError] = useState<string | null>(null);

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

  const fetchGoogleEvents = useCallback(async () => {
    if (entries.length === 0) {
      setGoogleEvents([]);
      setCalendarStatuses([]);
      return;
    }
    setGoogleFetching(true);
    setGoogleFetchError(null);

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

  const persistEntries = useCallback(async (next: GoogleCalendarEntry[]) => {
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
  }, [googleSetting, loadData]);

  const prevMonth = () => { setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)); setSelectedDay(null); };
  const nextMonth = () => { setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)); setSelectedDay(null); };

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

  const dayViewEvents = eventsByDay.get(dayViewDate) || [];
  const dayViewLabel = dayViewDate === todayIso ? `Today · ${fmtDayShort(dayViewDate)}` : fmtDayLong(dayViewDate);
  const shiftDayView = (days: number) => {
    const [y, m, d] = dayViewDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const nextIso = isoDay(dt);
    setDayViewDate(nextIso);
    setCursor(new Date(dt.getFullYear(), dt.getMonth(), 1));
  };

  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(null);
    setDayViewDate(todayIso);
  };

  const selectedDayEvents: GoogleEvent[] = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

  const hasAnyCalendar = entries.length > 0;
  const totalEvents = googleEvents.length;

  return (
    <div style={{ paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 24px)' }}>
      <PageHeader
        icon={CalendarDays}
        color="#1E5AC9"
        title="Calendar"
        right={
          <button
            type="button"
            onClick={goToday}
            className="btn"
            style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: 999, background: 'var(--surface-hover)', color: 'var(--text-primary)', touchAction: 'manipulation' }}
          >
            Today
          </button>
        }
      />

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

      {viewMode === 'month' && (
        <>
          <MonthGrid
            cursor={cursor}
            todayIso={todayIso}
            selectedDay={selectedDay}
            eventsByDay={eventsByDay}
            onPrev={prevMonth}
            onNext={nextMonth}
            onSelectDay={setSelectedDay}
          />

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
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedDayEvents.map(ev => <EventRow key={ev.uid} ev={ev} />)}
                  </div>}
            </div>
          )}

          {hasAnyCalendar && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Upcoming</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Nothing in the next 14 days.
                </p>
              ) : (
                <UpcomingList days={upcoming} todayIso={todayIso} />
              )}
            </div>
          )}
        </>
      )}

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
              {dayViewEvents.map(ev => <EventRow key={ev.uid} ev={ev} />)}
            </div>
          )}
        </div>
      )}

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
            <UpcomingList days={upcoming} todayIso={todayIso} />
          )}
        </div>
      )}

      <CalendarConnectionsPanel
        entries={entries}
        calendarStatuses={calendarStatuses}
        totalEvents={totalEvents}
        googleFetching={googleFetching}
        onPersist={persistEntries}
        onRefresh={fetchGoogleEvents}
      />
    </div>
  );
}
