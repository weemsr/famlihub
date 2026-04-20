"use client";
import { useEffect } from 'react';
import type { RecipeItem } from './constants';

export default function MealModal({
  activeMeal,
  activeDay,
  activeDayLabel,
  isFabAdd,
  selectedRecipeId,
  customName,
  mealNote,
  recipes,
  loading,
  onClose,
  onChangeDay,
  onSelectRecipe,
  onChangeCustomName,
  onChangeNote,
  onSave,
}: {
  activeMeal: string;
  activeDay: string;
  activeDayLabel: string;
  isFabAdd: boolean;
  selectedRecipeId: string;
  customName: string;
  mealNote: string;
  recipes: RecipeItem[];
  loading: boolean;
  onClose: () => void;
  onChangeDay: (nextDay: string) => void;
  onSelectRecipe: (id: string) => void;
  onChangeCustomName: (value: string) => void;
  onChangeNote: (value: string) => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="bottom-sheet-overlay">
      <div className="bottom-sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>{activeMeal}</h2>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{activeDayLabel}</div>
          </div>
          <button
            style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {isFabAdd && (
          <div style={{ marginBottom: 24 }}>
            <label className="form-label">Date</label>
            <input
              type="date"
              className="input"
              value={activeDay}
              onChange={e => e.target.value && onChangeDay(e.target.value)}
              style={{
                height: 50,
                borderRadius: 16,
                padding: '0 16px',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                fontSize: '1rem',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            />
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Link a Recipe</label>
          <select
            className="input"
            value={selectedRecipeId}
            onChange={e => onSelectRecipe(e.target.value)}
            style={{ appearance: 'none', height: 50, backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderRadius: 16 }}
          >
            <option value="">-- Choose a Saved Recipe --</option>
            {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>

        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 24 }}>
          — OR —
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Quick Add</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. In-N-Out Hot Dogs"
            value={customName}
            onChange={e => onChangeCustomName(e.target.value)}
            style={{ borderRadius: 16 }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Optional Note</label>
          <textarea
            className="input"
            placeholder="e.g. Prep the chicken on Sunday"
            value={mealNote}
            onChange={e => onChangeNote(e.target.value)}
            style={{ borderRadius: 16, height: 80, resize: 'none' }}
          />
        </div>

        <button
          className="btn"
          onClick={onSave}
          disabled={loading || (!selectedRecipeId && !customName.trim())}
          style={{ borderRadius: 16 }}
        >
          {loading ? 'Saving...' : 'Add to Planner'}
        </button>
      </div>
    </div>
  );
}
