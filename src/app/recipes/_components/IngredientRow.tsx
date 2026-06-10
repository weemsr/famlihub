"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { scaleIngredient } from '@/lib/recipe-scale';

export default function IngredientRow({ ing, scaleFactor = 1, showAddToGrocery = true }: { ing: string; scaleFactor?: number; showAddToGrocery?: boolean }) {
  const [showOptions, setShowOptions] = useState(false);
  const [addingState, setAddingState] = useState<'idle' | 'adding' | 'success'>('idle');

  const cleanText = ing.replace(/<[^>]*>?/gm, '');
  const displayText = scaleFactor !== 1 ? scaleIngredient(cleanText, scaleFactor) : cleanText;

  const addToGrocery = async (store: 'regular' | 'costco' | 'asian') => {
    setAddingState('adding');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setAddingState('idle'); return; }

    const { error } = await supabase.from('items').insert({
      type: 'grocery',
      title: displayText,
      body: { store },
      user_id: userData.user.id,
    });

    if (error) { setAddingState('idle'); return; }

    setAddingState('success');
    setShowOptions(false);
    setTimeout(() => setAddingState('idle'), 2000);
  };

  return (
    <li style={{ marginBottom: 12, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ flex: 1, paddingTop: 2 }}>{displayText}</span>

        {showAddToGrocery && (
          addingState === 'success' ? (
            <span style={{ color: 'var(--accent-color)', fontSize: 13, fontWeight: 'bold', minWidth: 50, textAlign: 'right' }}>Added! ✓</span>
          ) : (
            <button
              className="btn"
              style={{ padding: '4px 12px', fontSize: 12, width: 'auto', minWidth: 60, background: 'var(--surface-hover)', color: 'var(--text-primary)' }}
              onClick={() => setShowOptions(!showOptions)}
            >
              + Add
            </button>
          )
        )}
      </div>

      {showAddToGrocery && showOptions && addingState !== 'success' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12, width: 'auto', background: 'var(--accent-color)', color: 'white' }} onClick={() => addToGrocery('regular')}>Reg</button>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12, width: 'auto', background: 'var(--accent-color)', color: 'white' }} onClick={() => addToGrocery('costco')}>Costco</button>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12, width: 'auto', background: 'var(--accent-color)', color: 'white' }} onClick={() => addToGrocery('asian')}>Asian</button>
        </div>
      )}
    </li>
  );
}
