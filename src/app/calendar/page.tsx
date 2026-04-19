"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Info, Link2, Unlink, RefreshCw, ExternalLink, MapPin, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface GoogleEvent {
  uid: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  allDay: boolean;
  location?: string;
  htmlLink?: string;
}

interface SettingRow {
  id: string;
  body: { url?: string };
}

const GOOGLE_SETTING_TITLE = 'google_ical_url';

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
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isGoogleIcalUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === 'https:' && u.hostname === 'calendar.google.com' && u.pathname.startsWith('/calendar/ical/');
  } catch {
    return false;
  }
}

export default function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayIso = isoDay(today);

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Google state
  const [googleSetting, setGoogleSetting] = useState<SettingRow | null>(null);
  const [googleUrlInput, setGoogleUrlInput] = useState('');
  const [googleUrlError, setGoogleUrlError] = useState<string | null>(null);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [googleFetching, setGoogleFetching] = useState(false);
  const [googleFetchError, setGoogleFetchError] = useState<string | null>(null);
  const [showGcalHow, setShowGcalHow] = useState(false);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const settingRes = await supabase
      .from('items')
      .select('id,body')
      .eq('type', 'setting')
      .eq('title', GOOGLE_SETTING_TITLE)
      .maybeSingle();

    if (settingRes.data) setGoogleSetting(settingRes.data as unknown as SettingRow);
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

  // Fetch Google events for the visible month (+ next month for the agenda).
  const fetchGoogleEvents = useCallback(async (opts?: { silent?: boolean }) => {
    if (!googleSetting?.body?.url) {
      setGoogleEvents([]);
      return;
    }
    if (!opts?.silent) setGoogleFetching(true);
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
      const json = (await res.json()) as { events?: GoogleEvent[]; error?: string };
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setGoogleEvents(json.events || []);
    } catch (err) {
      setGoogleFetchError(err instanceof Error ? err.message : 'Failed to load Google events');
    } finally {
      setGoogleFetching(false);
    }
  }, [googleSetting, cursor]);

  useEffect(() => {
    fetchGoogleEvents();
  }, [fetchGoogleEvents]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, GoogleEvent[]>();
    for (const ev of googleEvents) {
      const key = isoDay(new Date(ev.start));
      const list = m.get(key);
      if (list) list.push(ev);
      else m.set(key, [ev]);
    }
    for (const [, list] of m) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start < b.start ? -1 : 1;
      });
    }
    return m;
  }, [googleEvents]);

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ iso: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d);
      cells.push({ iso: isoDay(day), dayNum: d });
    }
    // Pad trailing blanks so the last row always has 7 cells (no visual gap).
    while (cells.length % 7 !== 0) cells.push({ iso: null, dayNum: null });
    return cells;
  }, [cursor]);

  // "Upcoming" chronological list — next 14 days from today (skipping empty
  // days); used as the default agenda when no specific day is selected.
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

  const selectedDayEvents: GoogleEvent[] = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

  const monthLabel = cursor.toLocaleString('default', { month: 'long', year: 'numeric' });
  const prevMonth = () => { setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)); setSelectedDay(null); };
  const nextMonth = () => { setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)); setSelectedDay(null); };
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(null);
  };

  const saveGoogleUrl = async () => {
    const url = googleUrlInput.trim();
    if (!isGoogleIcalUrl(url)) {
      setGoogleUrlError("That doesn't look like a Google Calendar secret iCal URL. It should start with https://calendar.google.com/calendar/ical/");
      return;
    }
    setGoogleUrlError(null);
    setGoogleSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      if (googleSetting) {
        const { error } = await supabase
          .from('items')
          .update({ body: { url } })
          .eq('id', googleSetting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('items').insert({
          type: 'setting',
          title: GOOGLE_SETTING_TITLE,
          body: { url },
          user_id: userData.user.id,
        });
        if (error) throw error;
      }
      setGoogleUrlInput('');
      await loadData();
    } catch (err) {
      setGoogleUrlError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setGoogleSaving(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!googleSetting) return;
    if (typeof window !== 'undefined' && !window.confirm('Disconnect your Google Calendar? Your events will disappear from the FamLi calendar until you reconnect.')) return;
    const { error } = await supabase.from('items').delete().eq('id', googleSetting.id);
    if (!error) {
      setGoogleSetting(null);
      setGoogleEvents([]);
      setSelectedDay(null);
    }
  };

  // Agenda: either the selected day's events or the upcoming-14-days list.
  const renderEventRow = (ev: GoogleEvent) => (
    <div key={ev.uid} style={{
      display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10,
      background: 'var(--surface-hover)', alignItems: 'flex-start',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 54, flexShrink: 0 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4285F4', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {ev.allDay ? 'All day' : fmtTime(ev.start).replace(/\s/g, '').toLowerCase()}
        </span>
        {!ev.allDay && ev.end && ev.end !== ev.start && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {fmtTime(ev.end).replace(/\s/g, '').toLowerCase()}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {ev.htmlLink ? (
          <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {ev.title || '(no title)'}
            <ExternalLink size={12} style={{ opacity: 0.5 }} />
          </a>
        ) : (
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{ev.title || '(no title)'}</span>
        )}
        {ev.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <MapPin size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
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

      {/* Month grid */}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontWeight: 700, marginBottom: 6, fontSize: '0.72rem', color: 'var(--text-secondary)', letterSpacing: 0.6 }}>
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
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  justifyContent: 'space-between',
                  gap: 2,
                  transition: 'transform 0.08s ease, background 0.15s ease',
                }}
              >
                {/* Day number — top-centered */}
                <span style={{ textAlign: 'center', lineHeight: 1.1 }}>{cell.dayNum}</span>

                {/* Event bars — bottom of cell; fixed-height reservation keeps
                    every cell visually balanced whether or not it has events. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 12, justifyContent: 'flex-end' }}>
                  {count === 0 ? null : (
                    <>
                      {Array.from({ length: Math.min(count, 3) }).map((_, idx) => (
                        <span
                          key={idx}
                          aria-hidden
                          style={{
                            height: 3,
                            borderRadius: 2,
                            background: isToday ? 'rgba(255,255,255,0.9)' : '#4285F4',
                            opacity: idx === 0 ? 1 : idx === 1 ? 0.7 : 0.45,
                          }}
                        />
                      ))}
                      {count > 3 && (
                        <span style={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          color: isToday ? 'rgba(255,255,255,0.95)' : 'var(--text-secondary)',
                          lineHeight: 1,
                          textAlign: 'center',
                          marginTop: 1,
                        }}>
                          +{count - 3}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda — either selected day's events or upcoming-14-days list */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <h3 style={{ marginBottom: 0 }}>
            {selectedDay
              ? (selectedDay === todayIso ? `Today — ${fmtDayShort(selectedDay)}` : fmtDayLong(selectedDay))
              : 'Upcoming'}
          </h3>
          {selectedDay ? (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, touchAction: 'manipulation' }}
            >
              <X size={14} /> Clear
            </button>
          ) : googleSetting ? (
            <button
              type="button"
              onClick={() => fetchGoogleEvents()}
              disabled={googleFetching}
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, touchAction: 'manipulation' }}
            >
              <RefreshCw size={14} /> {googleFetching ? '…' : 'Refresh'}
            </button>
          ) : null}
        </div>

        {googleFetchError && (
          <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{googleFetchError}</p>
        )}

        {!googleSetting ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Connect your Google Calendar below to see your events here.
          </p>
        ) : selectedDay ? (
          selectedDayEvents.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing scheduled.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedDayEvents.map(renderEventRow)}
            </div>
          )
        ) : upcoming.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No events in the next 14 days. Tap any day on the grid to see what&apos;s scheduled.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {upcoming.map(({ iso, events }) => (
              <div key={iso}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' }}>
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

      {/* Connect / manage Google Calendar */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Link2 size={20} style={{ color: '#4285F4' }} />
          <h3 style={{ marginBottom: 0 }}>
            {googleSetting ? 'Google Calendar connected' : 'Show my Google Calendar here'}
          </h3>
        </div>

        {!googleSetting ? (
          <>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              Paste your Google Calendar&apos;s secret iCal URL. Your events will appear on the grid and in the agenda above.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                className="input"
                placeholder="https://calendar.google.com/calendar/ical/..."
                value={googleUrlInput}
                onChange={e => { setGoogleUrlInput(e.target.value); setGoogleUrlError(null); }}
                style={{ fontSize: '0.85rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '10px 14px' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0 16px', width: 'auto', fontSize: '13px', touchAction: 'manipulation' }}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    setGoogleUrlInput(text.trim());
                    setGoogleUrlError(null);
                  } catch (err) {
                    console.error('Clipboard error', err);
                    setGoogleUrlError("Couldn't read from the clipboard. Paste manually instead.");
                  }
                }}
                disabled={googleSaving}
              >
                Paste 📋
              </button>
              <button
                type="button"
                className="btn"
                onClick={saveGoogleUrl}
                disabled={googleSaving || !googleUrlInput.trim()}
                style={{ width: 'auto', padding: '0 16px', touchAction: 'manipulation' }}
              >
                {googleSaving ? 'Saving…' : 'Connect'}
              </button>
            </div>

            {googleUrlError && (
              <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{googleUrlError}</p>
            )}

            <button
              type="button"
              onClick={() => setShowGcalHow(v => !v)}
              style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Info size={14} /> {showGcalHow ? 'Hide instructions' : 'Where do I find this URL?'}
            </button>

            {showGcalHow && (
              <ol style={{ marginTop: 10, marginBottom: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Google Calendar</a> on a desktop.</li>
                <li>In the left sidebar under <em>My calendars</em>, hover over the calendar you want to see, click the <strong>⋮</strong> (three dots), then <strong>Settings and sharing</strong>.</li>
                <li>Scroll down to <strong>Integrate calendar</strong>.</li>
                <li>Copy the URL labeled <strong>Secret address in iCal format</strong> (not the Public one).</li>
                <li>Paste it above and click Connect.</li>
              </ol>
            )}

            <p className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: 14, marginBottom: 0, fontSize: '0.8rem' }}>
              That URL is private — keep it out of shared channels. It stays on your FamLi account and is only used by FamLi&apos;s server to fetch events.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
              {googleEvents.length > 0 ? `${googleEvents.length} events loaded for this view.` : 'No events in the current window.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fetchGoogleEvents()}
                disabled={googleFetching}
                style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
              >
                <RefreshCw size={16} /> {googleFetching ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={disconnectGoogle}
                style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
              >
                <Unlink size={16} /> Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
