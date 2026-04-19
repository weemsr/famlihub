"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Copy, Check, Info } from 'lucide-react';
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

const MEAL_SLOT_ORDER: Record<string, number> = { Breakfast: 0, Lunch: 1, Dinner: 2 };

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHow, setShowHow] = useState(false);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const [mealsRes, recipesRes] = await Promise.all([
      supabase.from('items').select('id,title,body,created_at').eq('type', 'meal'),
      supabase.from('items').select('id,title').eq('type', 'recipe'),
    ]);
    if (mealsRes.data) setMeals(mealsRes.data as unknown as MealItem[]);
    if (recipesRes.data) setRecipes(recipesRes.data as unknown as RecipeItem[]);
  }, []);

  // Live sync via the same realtime channel pattern the other pages use.
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

  // Fetch the signed feed URL once we have a session.
  useEffect(() => {
    let cancelled = false;
    async function getFeed() {
      setFeedLoading(true);
      setFeedError(null);
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) {
        setFeedLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/calendar-feed-url', {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed (${res.status})`);
        }
        const json = (await res.json()) as { url?: string; error?: string };
        if (!cancelled) {
          if (json.url) setFeedUrl(json.url);
          else setFeedError(json.error || 'No URL returned.');
        }
      } catch (err) {
        if (!cancelled) setFeedError(err instanceof Error ? err.message : 'Failed to load feed URL');
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    }
    getFeed();
    return () => { cancelled = true; };
  }, []);

  const recipeById = useMemo(() => {
    const m = new Map<string, RecipeItem>();
    for (const r of recipes) m.set(r.id, r);
    return m;
  }, [recipes]);

  // Day → meals[] map for fast cell rendering + upcoming list.
  const mealsByDay = useMemo(() => {
    const m = new Map<string, MealItem[]>();
    for (const meal of meals) {
      if (!meal.body?.day) continue;
      const list = m.get(meal.body.day);
      if (list) list.push(meal);
      else m.set(meal.body.day, [meal]);
    }
    // Sort each day's meals by slot order.
    for (const [, list] of m) {
      list.sort((a, b) => (MEAL_SLOT_ORDER[a.body.mealId] ?? 99) - (MEAL_SLOT_ORDER[b.body.mealId] ?? 99));
    }
    return m;
  }, [meals]);

  // Build the calendar grid for the cursor month.
  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // Sun=0..Sat=6
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
    const start = isoDay(today);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 6);
    const end = isoDay(endDate);

    const result: Array<{ iso: string; list: MealItem[] }> = [];
    // Walk 7 days from today.
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = isoDay(d);
      const list = (mealsByDay.get(iso) || []).slice();
      if (list.length) result.push({ iso, list });
    }
    void start; void end;
    return result;
  }, [today, mealsByDay]);

  const monthLabel = cursor.toLocaleString('default', { month: 'long', year: 'numeric' });
  const prevMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const nextMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1));

  const todayIso = isoDay(today);

  const onCopyFeed = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op; user can long-press to copy
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

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}
          >
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ marginBottom: 0 }}>{monthLabel}</h2>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}
          >
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
                  minHeight: 44,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span>{cell.dayNum}</span>
                {dayMeals.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, height: 6 }}>
                    {dayMeals.slice(0, 3).map(m => (
                      <span
                        key={m.id}
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: isToday ? 'rgba(255,255,255,0.9)' : 'var(--accent-color)',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming 7-day summary */}
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Upcoming (next 7 days)</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing scheduled. Add meals on the <Link href="/meals" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Meals</Link> page.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {upcoming.map(({ iso, list }) => (
              <div key={iso}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {iso === todayIso ? `Today — ${fmtDayShort(iso)}` : fmtDayShort(iso)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map(m => {
                    const r = m.body.recipeId ? recipeById.get(m.body.recipeId) : null;
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 72 }}>
                          {m.body.mealId}
                        </span>
                        <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {r?.title || m.body.customName || '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Google Calendar sync */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <CalIcon size={20} style={{ color: 'var(--accent-color)' }} />
          <h3 style={{ marginBottom: 0 }}>Sync with Google Calendar</h3>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Subscribe once and your meal plan shows up on your Google Calendar automatically.
        </p>

        {feedLoading && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Preparing your feed URL…</p>
        )}
        {feedError && (
          <p className="text-sm" style={{ color: 'var(--danger-color)' }}>{feedError}</p>
        )}
        {feedUrl && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 12 }}>
              <input
                type="text"
                readOnly
                value={feedUrl}
                onFocus={e => e.currentTarget.select()}
                className="input"
                style={{ fontSize: '0.85rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '10px 14px' }}
              />
              <button
                type="button"
                onClick={onCopyFeed}
                aria-label="Copy feed URL"
                className="btn"
                style={{ width: 'auto', padding: '0 16px', touchAction: 'manipulation', background: copied ? 'var(--success-color)' : undefined }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowHow(v => !v)}
              style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Info size={14} /> {showHow ? 'Hide instructions' : 'How to subscribe'}
            </button>
            {showHow && (
              <ol style={{ marginTop: 10, marginBottom: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Google Calendar</a> on a desktop browser.</li>
                <li>In the left sidebar, click the <strong>+</strong> next to <em>Other calendars</em>.</li>
                <li>Choose <strong>From URL</strong>.</li>
                <li>Paste the URL above and click <strong>Add calendar</strong>.</li>
                <li>Google refreshes the feed on its own schedule (often every several hours).</li>
              </ol>
            )}
            <p className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: 14, marginBottom: 0, fontSize: '0.8rem' }}>
              Keep this URL private — anyone with it can see your meal plan.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
