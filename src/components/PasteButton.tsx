"use client";
import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';

type State = 'idle' | 'ok' | 'error';

/**
 * Reads the clipboard on tap. Mobile keyboards make long-press-to-paste
 * fiddly, so an explicit button is much easier — especially in a textarea.
 *
 * `navigator.clipboard.readText()` genuinely fails in normal situations
 * (Firefox blocks it, Safari shows a permission prompt the user can decline,
 * and it's unavailable outside secure contexts), so failure is surfaced
 * instead of swallowed — otherwise a dead-looking button leaves the user with
 * no idea to just long-press instead.
 */
export default function PasteButton({
  onPaste,
  disabled,
  label = 'Paste',
}: {
  onPaste: (text: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [state, setState] = useState<State>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = (next: State) => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const handle = async () => {
    try {
      const text = await navigator.clipboard?.readText();
      if (!text) { flash('error'); return; }
      onPaste(text);
      flash('ok');
    } catch {
      flash('error');
    }
  };

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={handle}
      disabled={disabled}
      title={state === 'error' ? "Your browser blocked clipboard access — long-press the box and choose Paste" : 'Paste from clipboard'}
      style={{
        width: 'auto', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700,
        borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6,
        color: state === 'error' ? 'var(--danger-color)' : 'var(--text-primary)',
        touchAction: 'manipulation',
      }}
    >
      <ClipboardPaste size={14} />
      {state === 'ok' ? 'Pasted' : state === 'error' ? "Can't paste" : label}
    </button>
  );
}
