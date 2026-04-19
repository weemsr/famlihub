"use client";
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'famli.theme';

function apply(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

function read(): Theme | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark') return v;
  return null;
}

function resolveInitial(): Theme {
  const stored = read();
  if (stored) return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  // Initialize after hydration to match the no-flash bootstrap script.
  useEffect(() => {
    const next = resolveInitial();
    setTheme(next);
    apply(next);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / quota; theme still applies for this session.
    }
    apply(next);
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
