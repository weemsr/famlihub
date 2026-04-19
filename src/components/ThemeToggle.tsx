"use client";
import { useEffect, useState } from 'react';
import { Sun, Moon, MonitorSmartphone } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'famli.theme';

function apply(theme: Theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function read(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  // Initialize from localStorage after hydration to match the no-flash script.
  useEffect(() => {
    setTheme(read());
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
    { id: 'system', icon: MonitorSmartphone, label: 'Match system theme' },
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
