"use client";
import { useEffect, useMemo, useState } from 'react';

/** Day identity in local time. Not an ISO date — only used for equality. */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Local-midnight `Date` for today that actually rolls over.
 *
 * `useMemo(() => new Date(), [])` freezes "today" at mount, so a tab left open
 * overnight keeps showing yesterday — stale overdue counts, a "Today" highlight
 * on the wrong cell. This re-checks on a timer and whenever the tab is
 * refocused (phones suspend timers in the background, so the visibility and
 * focus listeners are what actually catch the rollover in practice).
 *
 * The returned identity is stable for the whole day, so it's safe as a
 * dependency of a `useMemo` or `useEffect`.
 */
export function useToday(): Date {
  const [key, setKey] = useState(() => dayKey(new Date()));

  useEffect(() => {
    const refresh = () => {
      const next = dayKey(new Date());
      setKey(prev => (prev === next ? prev : next));
    };
    const interval = window.setInterval(refresh, 60 * 1000);
    window.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // Rebuilt from `key`, so a new Date instance appears only when the calendar
  // day changes — never on an unrelated re-render.
  return useMemo(() => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month, day);
  }, [key]);
}
