"use client";
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { scaleIngredient } from '@/lib/recipe-scale';
import { LIMITS, capLen } from '@/lib/limits';

type AddState = 'idle' | 'adding' | 'success' | 'error';

const STORES: { id: 'regular' | 'costco' | 'asian'; label: string }[] = [
  { id: 'regular', label: 'Reg' },
  { id: 'costco', label: 'Costco' },
  { id: 'asian', label: 'Asian' },
];

export default function IngredientRow({ ing, scaleFactor = 1, showAddToGrocery = true }: { ing: string; scaleFactor?: number; showAddToGrocery?: boolean }) {
  const [showOptions, setShowOptions] = useState(false);
  const [state, setState] = useState<AddState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending reset timer if the row unmounts (recipe collapsed or
  // rescaled) so we never setState on an unmounted component.
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  const cleanText = ing.replace(/<[^>]*>?/gm, '');
  const displayText = scaleFactor !== 1 ? scaleIngredient(cleanText, scaleFactor) : cleanText;

  const addToGrocery = async (store: 'regular' | 'costco' | 'asian') => {
    if (state === 'adding') return; // guard: ignore extra taps while the insert is in flight
    setState('adding');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setState('idle'); return; }

    const { error } = await supabase.from('items').insert({
      type: 'grocery',
      title: capLen(displayText, LIMITS.title),
      // `order` lands the item at the bottom and keeps it consistent with the
      // grocery list's drag-reorder sort (which orders by body.order).
      body: { store, order: Date.now() },
      user_id: userData.user.id,
    });

    if (error) {
      setState('error');
      resetTimer.current = setTimeout(() => setState('idle'), 2500);
      return;
    }

    setState('success');
    setShowOptions(false);
    resetTimer.current = setTimeout(() => setState('idle'), 1500);
  };

  return (
    <li style={{ marginBottom: 12, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ flex: 1, paddingTop: 2 }}>{displayText}</span>

        {showAddToGrocery && (
          state === 'success' ? (
            <span style={{ color: 'var(--accent-color)', fontSize: 13, fontWeight: 'bold', minWidth: 56, textAlign: 'right' }}>Added ✓</span>
          ) : state === 'error' ? (
            <span style={{ color: 'var(--danger-color)', fontSize: 13, fontWeight: 'bold', minWidth: 56, textAlign: 'right' }}>Failed</span>
          ) : (
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 12px', fontSize: 12, width: 'auto', minWidth: 60, background: showOptions ? 'var(--accent-color)' : 'var(--surface-hover)', color: showOptions ? 'white' : 'var(--text-primary)', touchAction: 'manipulation' }}
              onClick={() => setShowOptions(v => !v)}
            >
              {showOptions ? 'Close' : '+ Add'}
            </button>
          )
        )}
      </div>

      {showAddToGrocery && showOptions && state !== 'success' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          {STORES.map(s => (
            <button
              key={s.id}
              type="button"
              className="btn"
              disabled={state === 'adding'}
              onClick={() => addToGrocery(s.id)}
              style={{
                padding: '4px 10px', fontSize: 12, width: 'auto',
                background: 'var(--accent-color)', color: 'white',
                opacity: state === 'adding' ? 0.55 : 1,
                cursor: state === 'adding' ? 'default' : 'pointer',
                touchAction: 'manipulation',
              }}
            >
              {s.label}
            </button>
          ))}
          {state === 'adding' && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Adding…</span>}
        </div>
      )}
    </li>
  );
}
