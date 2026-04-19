"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Info, Link2, Unlink, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MealBody } from '@/lib/types';

interface MealItem {
  id: string;
  title?: string;
  body: MealBody;
  created_at?: string;
}

interface RecipeItem {
  id: string;
  title: string;
}

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

const MEAL_SLOT_ORDER: Record<string, number> = { Breakfast: 0, Lunch: 1, Dinner: 2 };

const GOOGLE_SETTING_TITLE = 'google_ical_url';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);

  // Inbound (Google → FamLi) state
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

    const [mealsRes, recipesRes, settingRes] = await Promise.all([
      supabase.from('items').select('id,title,body,created_at').eq('type', 'meal'),
      supabase.from('items').select('id,title').eq('type', 'recipe'),
      supabase
        .from('items')
        .select('id,body')
        .eq('type', 'setting')
        .eq('title', GOOGLE_SETTING_TITLE)
        .maybeSingle(),
    ]);
    if (mealsRes.data) setMeals(mealsRes.data as unknown as MealItem[]);
    if (recipesRes.data) setRecipes(recipesRes.data as unknown as RecipeItem[]);
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
        { event: '*', schema: 'public', table: 'items' },
        () => loadRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const recipeById = useMemo(() => {
    const m = new Map<string, RecipeItem>();
    for (const r of recipes) m.set(r.id, r);
    return m;
  }, [recipes]);

  // Fetch Google events for the visible month (plus the 7-day upcoming window).
  const fetchGoogleEvents = useCallback(async (opts?: { silent?: boolean }) => {
    if (!googleSetting?.body?.url) {
      setGoogleEvents([]);
      return;
    }
    if (!opts?.silent) setGoogleFetching(true);
    setGoogleFetchError(null);

    // Window: start of current month view, end of next month — covers the
    // grid and the upcoming-7-days list even near month boundaries.
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

  // Refetch whenever the cursor month or stored URL changes.
  useEffect(() => {
    fetchGoogleEvents();
  }, [fetchGoogleEvents]);

  const mealsByDay = useMemo(() => {
    const m = new Map<string, MealItem[]>();
    for (const meal of meals) {
      if (!meal.body?.day) continue;
      const list = m.get(meal.body.day);
      if (list) list.push(meal);
      else m.set(meal.body.day, [meal]);
    }
    for (const [, list] of m) {
      list.sort((a, b) => (MEAL_SLOT_ORDER[a.body.mealId] ?? 99) - (MEAL_SLOT_ORDER[b.body.mealId] ?? 99));
    }
    return m;
  }, [meals]);

  const googleEventsByDay = useMemo(() => {
    const m = new Map<string, GoogleEvent[]>();
    for (const ev of googleEvents) {
      const key = isoDay(new Date(ev.start));
      const list = m.get(key);
      if (list) list.push(ev);
      else m.set(key, [ev]);
    }
    for (const [, list] of m) {
      list.sort((a, b) => (a.start < b.start ? -1 : 1));
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
    return cells;
  }, [cursor]);

  const upcoming = useMemo(() => {
    const result: Array<{ iso: string; meals: MealItem[]; events: GoogleEvent[] }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = isoDay(d);
      const dayMeals = mealsByDay.get(iso) || [];
      const dayEvents = googleEventsByDay.get(iso) || [];
      if (dayMeals.length || dayEvents.length) result.push({ iso, meals: dayMeals, events: dayEvents });
    }
    return result;
  }, [today, mealsByDay, googleEventsByDay]);

  const monthLabel = cursor.toLocaleString('default', { month: 'long', year: 'numeric' });
  const prevMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const nextMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1));

  const todayIso = isoDay(today);

  const saveGoogleUrl = async () => {
    const url = googleUrlInput.trim();
    if (!isGoogleIcalUrl(url)) {
      setGoogleUrlError('That doesn\'t look like a Google Calendar secret iCal URL. It should start with https://calendar.google.com/calendar/ical/');
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
    if (typeof window !== 'undefined' && !window.confirm('Disconnect your Google Calendar? Your Google events will disappear from the FamLi calendar until you reconnect.')) return;
    const { error } = await supabase.from('items').delete().eq('id', googleSetting.id);
    if (!error) {
      setGoogleSetting(null);
      setGoogleEvents([]);
    }
  };

  return (
    <div style={{ paddingBottom: 60 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontWeight: 700, marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {grid.map((cell, i) => {
            if (!cell.iso || cell.dayNum === null) {
              return <div key={`blank-${i}`} style={{ padding: '12px 0' }} />;
            }
            const dayMeals = mealsByDay.get(cell.iso) || [];
            const dayEvents = googleEventsByDay.get(cell.iso) || [];
            const isToday = cell.iso === todayIso;
            return (
              <div
                key={cell.iso}
                style={{
                  padding: '8px 0 6px',
                  textAlign: 'center',
                  backgroundColor: isToday ? 'var(--accent-color)' : 'var(--surface-hover)',
                  color: isToday ? 'white' : 'var(--text-primary)',
                  borderRadius: 8,
                  fontWeight: isToday ? 700 : 500,
                  fontSize: '0.9rem',
                  minHeight: 48,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span>{cell.dayNum}</span>
                {(dayMeals.length > 0 || dayEvents.length > 0) && (
                  <div style={{ display: 'flex', gap: 3, height: 6 }}>
                    {dayMeals.slice(0, 3).map(m => (
                      <span key={`m-${m.id}`} aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: isToday ? 'rgba(255,255,255,0.9)' : 'var(--accent-color)' }} />
                    ))}
                    {dayEvents.slice(0, 3).map(ev => (
                      <span key={`g-${ev.uid}`} aria-hidden title={ev.title} style={{ width: 6, height: 6, borderRadius: 999, background: isToday ? 'rgba(255,255,255,0.6)' : '#4285F4' }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent-color)' }} /> Meals
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#4285F4' }} /> Google events
          </span>
        </div>
      </div>

      {/* Upcoming */}
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Upcoming (next 7 days)</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing scheduled. Add meals on the <Link href="/meals" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Meals</Link> page{googleSetting ? '' : ', or connect a Google Calendar below'}.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {upcoming.map(({ iso, meals: mealList, events: eventList }) => (
              <div key={iso}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {iso === todayIso ? `Today — ${fmtDayShort(iso)}` : fmtDayShort(iso)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {mealList.map(m => {
                    const r = m.body.recipeId ? recipeById.get(m.body.recipeId) : null;
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 72 }}>{m.body.mealId}</span>
                        <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>{r?.title || m.body.customName || '—'}</span>
                      </div>
                    );
                  })}
                  {eventList.map(ev => (
                    <div key={ev.uid} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4285F4', minWidth: 72 }}>
                        {ev.allDay ? 'All day' : fmtTime(ev.start)}
                      </span>
                      {ev.htmlLink ? (
                        <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {ev.title || '(no title)'}
                          <ExternalLink size={12} style={{ opacity: 0.6 }} />
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>{ev.title || '(no title)'}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inbound: Google Calendar → FamLi */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Link2 size={20} style={{ color: '#4285F4' }} />
          <h3 style={{ marginBottom: 0 }}>Show my Google Calendar here</h3>
        </div>

        {!googleSetting ? (
          <>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              Paste your Google Calendar&apos;s secret iCal URL. Your events will show up on the grid above and in the upcoming list, alongside your meals.
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
              Connected. {googleEvents.length > 0 ? `${googleEvents.length} events in the current view.` : 'No events in this window.'}
            </p>
            {googleFetchError && (
              <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{googleFetchError}</p>
            )}
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
