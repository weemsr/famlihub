"use client";
import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'famli.theme';
const CHANGE_EVENT = 'famli-theme-change';

function apply(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

function read(): Theme | null {
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark') return v;
  return null;
}

/**
 * Theme as an external store: localStorage override first, then the system
 * preference. useSyncExternalStore keeps hydration safe — the server snapshot
 * is 'light' and the client corrects right after hydration, matching the
 * no-flash bootstrap script in layout.tsx that already set data-theme
 * pre-paint (so there is still no visible flash).
 */
function getSnapshot(): Theme {
  const stored = read();
  if (stored) return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getServerSnapshot(): Theme {
  return 'light';
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange); // cross-tab sync
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = (next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / quota; theme still applies for this session.
    }
    apply(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const options: Array<{ id: Theme; icon: typeof Sun; label: string }> = [
    { id: 'light', icon: Sun, label: 'Light mode' },
    { id: 'dark', icon: Moon, label: 'Dark mode' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: 'inline-flex',
        gap: 2,
        background: 'var(--surface-hover)',
        padding: 2,
        borderRadius: 999,
      }}
    >
      {options.map(({ id, icon: Icon, label }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 999,
              border: 'none',
              background: active ? 'var(--surface-color)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: active ? '0 1px 4px var(--hairline-strong)' : 'none',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
