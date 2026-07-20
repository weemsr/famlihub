"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CheckSquare, ShoppingCart, Utensils, PenTool, Package, Calendar as CalIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';

interface GoogleEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  day?: string; // calendar date for all-day events (no timezone)
  location?: string;
}

function fmtTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
}

export default function Home() {
  const [counts, setCounts] = useState({ todo: 0, grocery: 0, recipe: 0, note: 0, inventory: 0 });

  // Today's calendar state
  const [todayEvents, setTodayEvents] = useState<GoogleEvent[] | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);

  // Fetch is separated from state application so the mount effect applies
  // data in a .then callback (react-hooks/set-state-in-effect compliant).
  const loadCounts = useCallback(() => {
    const run = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;

      // Head-only count queries: the dashboard needs numbers, not rows, so
      // don't download the whole items table just to count it client-side.
      const countOf = (type: string, pendingOnly = false) => {
        let q = supabase.from('items').select('*', { count: 'exact', head: true }).eq('type', type);
        if (pendingOnly) q = q.eq('is_completed', false);
        return q;
      };
      const [todo, grocery, recipe, note, inventory] = await Promise.all([
        countOf('todo', true),
        countOf('grocery', true),
        countOf('recipe'),
        countOf('note'),
        countOf('inventory'),
      ]);
      return {
        todo: todo.count ?? 0,
        grocery: grocery.count ?? 0,
        recipe: recipe.count ?? 0,
        note: note.count ?? 0,
        inventory: inventory.count ?? 0,
      };
    };
    run().then(c => { if (c) setCounts(c); });
  }, []);

  // Fetch is separated from state application (applied in a .then callback)
  // for react-hooks/set-state-in-effect compliance.
  const loadTodayEvents = useCallback(() => {
    type Result =
      | { kind: 'skip' }
      | { kind: 'httpError'; message: string }
      | { kind: 'fetchError'; message: string }
      | { kind: 'ok'; connected: boolean; events: GoogleEvent[] };

    const run = async (): Promise<Result> => {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) return { kind: 'skip' };

      // Local-day window: midnight today → midnight tomorrow.
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(start.getDate() + 1);

      try {
        const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
        const res = await fetch(`/api/google-calendar/events?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        const json = (await res.json()) as { events?: GoogleEvent[]; connected?: boolean; error?: string };
        if (!res.ok) {
          return { kind: 'httpError', message: json.error || `Request failed (${res.status})` };
        }
        // All-day events have no timezone; the server's overlap window can let
        // tomorrow's all-day events leak in a day early. Keep only the ones
        // whose calendar date is actually today (local).
        const todayIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        const events = (json.events || []).filter(ev => !ev.allDay || !ev.day || ev.day === todayIso);
        return { kind: 'ok', connected: !!json.connected, events };
      } catch (err) {
        return { kind: 'fetchError', message: err instanceof Error ? err.message : 'Failed to load calendar' };
      }
    };

    run().then(r => {
      if (r.kind === 'skip') return;
      if (r.kind === 'httpError') {
        setTodayError(r.message);
        setCalendarConnected(null);
        setTodayEvents(null);
        return;
      }
      if (r.kind === 'fetchError') {
        setTodayError(r.message);
        return;
      }
      setTodayError(null);
      setCalendarConnected(r.connected);
      setTodayEvents(r.events);
    });
  }, []);

  useEffect(() => {
    loadCounts();
    loadTodayEvents();

    // Keep counts live: any insert/update/delete on items (scoped to this
    // user by RLS) refreshes the dashboard. Setting-row changes (like the
    // Google calendar URL being connected/disconnected) refresh the
    // today's-calendar card.
    const channel = supabase
      .channel('realtime:home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        payload => {
          loadCounts();
          const newRow = payload.new as { type?: string } | null;
          const oldRow = payload.old as { type?: string } | null;
          if (newRow?.type === 'setting' || oldRow?.type === 'setting') {
            loadTodayEvents();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCounts, loadTodayEvents]);

  return (
    <div>
      <div style={{ marginLeft: -20, marginRight: -20, marginTop: -24, marginBottom: 24 }}>
        <Image
          src="/logo3.png"
          alt="FamLi Hub Logo"
          width={1600}
          height={900}
          priority
          sizes="(max-width: 800px) 100vw, 800px"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <ThemeToggle />
        <button
          onClick={() => {
            // AuthProvider's onAuthStateChange flips back to the login screen
            // when the session becomes null; no full-page reload needed.
            void supabase.auth.signOut();
          }}
          style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.2)', padding: '6px 12px', borderRadius: 8, color: 'var(--danger-color)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </div>

      {/* Today's Calendar — glanceable agenda for right now */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CalIcon size={20} style={{ color: 'var(--accent-color)' }} />
            <h3 style={{ marginBottom: 0 }}>Today&apos;s Calendar</h3>
          </div>
          <Link href="/calendar" style={{ fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: 600 }}>
            Open
          </Link>
        </div>

        {todayEvents === null && !todayError && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        )}

        {todayError && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Couldn&apos;t load the calendar. <Link href="/calendar" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Check settings</Link>.
          </p>
        )}

        {todayEvents !== null && calendarConnected === false && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Connect your Google Calendar on the <Link href="/calendar" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Calendar tab</Link> to see today&apos;s events here.
          </p>
        )}

        {todayEvents !== null && calendarConnected && todayEvents.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing on your calendar today. 🎉</p>
        )}

        {todayEvents !== null && calendarConnected && todayEvents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todayEvents.slice(0, 5).map(ev => (
              <div key={ev.uid} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-hover)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-color)', letterSpacing: 0.4, textTransform: 'uppercase', minWidth: 54, flexShrink: 0, paddingTop: 2 }}>
                  {ev.allDay ? 'All day' : fmtTimeShort(ev.start)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {ev.title || '(no title)'}
                  </span>
                  {ev.location && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.location}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {todayEvents.length > 5 && (
              <Link href="/calendar" style={{ fontSize: '0.82rem', color: 'var(--accent-color)', fontWeight: 600, marginTop: 4, textAlign: 'center' }}>
                View all {todayEvents.length} events →
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Recent Groceries</h3>
        <p className="text-sm">You have {counts.grocery} items left to buy.</p>
        <Link href="/groceries" className="btn mt-4">
          <ShoppingCart size={18} /> Open Groceries
        </Link>
      </div>

      <div className="flex gap-4 mb-4">
        <Link href="/todos" className="card w-full" style={{ marginBottom: 0, display: 'block', textDecoration: 'none' }}>
          <CheckSquare size={24} className="mb-4" style={{ color: "var(--accent-color)" }} />
          <h3 style={{ marginBottom: 4 }}>To-do</h3>
          <p className="text-sm">{counts.todo} pending</p>
        </Link>
        <Link href="/recipes" className="card w-full" style={{ marginBottom: 0, display: 'block', textDecoration: 'none' }}>
          <Utensils size={24} className="mb-4" style={{ color: "var(--accent-color)" }} />
          <h3 style={{ marginBottom: 4 }}>Recipes</h3>
          <p className="text-sm">{counts.recipe} saved</p>
        </Link>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Whiteboard Notes</h3>
        <p className="text-sm">{counts.note} specific sticky notes saved on the board.</p>
        <Link href="/notes" className="btn mt-4 btn-secondary" style={{ background: 'var(--surface-hover)', color: 'var(--text-primary)' }}>
          <PenTool size={18} /> Read Board
        </Link>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Pantry Inventory</h3>
        <p className="text-sm">{counts.inventory} ingredients logged.</p>
        <Link href="/inventory" className="btn mt-4 btn-secondary" style={{ background: 'var(--surface-color)', color: 'var(--text-primary)', border: '2px solid var(--hairline-strong)' }}>
          <Package size={18} /> Open Pantry
        </Link>
      </div>
    </div>
  );
}
