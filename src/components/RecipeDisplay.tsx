"use client";
import { useEffect, useState } from 'react';
import { asStringArray, type RecipeBody } from '@/lib/types';
import IngredientRow from '@/app/recipes/_components/IngredientRow';

/**
 * Read-only recipe detail: servings scaler + ingredients + instructions.
 * Extracted from RecipeCard so the Recipes tab and the Meals tab's recipe
 * viewer render identically from one source of truth.
 *
 * The scaler owns its own state and resets whenever the recipe changes.
 * `showAddToGrocery` gates the per-ingredient "Add to grocery list" affordance:
 * the Recipes tab passes `true`; the Meals viewer leaves it off (view-only).
 */
interface RecipeLike {
  id: string;
  title: string;
  body?: RecipeBody | null;
}

export default function RecipeDisplay({
  recipe,
  showAddToGrocery = false,
}: {
  recipe: RecipeLike;
  showAddToGrocery?: boolean;
}) {
  const body: RecipeBody = recipe.body || {};
  const originalServings = typeof body.servings === 'number' && body.servings > 0 ? body.servings : undefined;

  type ScaleMode = '1' | '1.5' | '2' | 'custom';
  const [scaleMode, setScaleMode] = useState<ScaleMode>('1');
  const [customValue, setCustomValue] = useState<string>(originalServings ? String(originalServings) : '1');

  useEffect(() => {
    setScaleMode('1');
    setCustomValue(originalServings ? String(originalServings) : '1');
  }, [originalServings, recipe.id]);

  let scaleFactor = 1;
  if (scaleMode === 'custom') {
    const v = parseFloat(customValue);
    if (Number.isFinite(v) && v > 0) {
      scaleFactor = originalServings ? v / originalServings : v;
    }
  } else {
    scaleFactor = parseFloat(scaleMode);
  }

  const scaledServings = originalServings
    ? Math.round(originalServings * scaleFactor * 10) / 10
    : undefined;

  const ingredients = asStringArray(body.ingredients);
  const instructions = asStringArray(body.instructions);

  return (
    <>
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '12px 14px', marginBottom: 16,
          background: 'var(--surface-hover)', borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.3, textTransform: 'uppercase' }}>
            Scale
          </span>
          {originalServings && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Serves <strong style={{ color: 'var(--text-primary)' }}>{originalServings}</strong>
              {scaleFactor !== 1 && scaledServings && (
                <>
                  <span style={{ margin: '0 6px' }}>→</span>
                  <strong style={{ color: 'var(--accent-color)' }}>{scaledServings}</strong>
                </>
              )}
            </span>
          )}
        </div>

        <div
          role="group"
          aria-label="Scale ingredients"
          style={{
            display: 'inline-flex', gap: 4, padding: 4,
            background: 'var(--background)', borderRadius: 999,
            border: '1px solid var(--hairline)', alignSelf: 'flex-start',
          }}
        >
          {(['1', '1.5', '2', 'custom'] as ScaleMode[]).map(mode => {
            const active = scaleMode === mode;
            const label = mode === 'custom' ? 'Custom' : `${mode}×`;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setScaleMode(mode)}
                aria-pressed={active}
                style={{
                  padding: '6px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: active ? 'var(--accent-color)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 999,
                  cursor: 'pointer',
                  transition: 'background 120ms ease, color 120ms ease',
                  minWidth: mode === 'custom' ? 72 : 52,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {scaleMode === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <label style={{ color: 'var(--text-secondary)' }} htmlFor={`custom-scale-${recipe.id}`}>
              {originalServings ? 'Target servings' : 'Multiplier'}
            </label>
            <input
              id={`custom-scale-${recipe.id}`}
              type="number"
              inputMode="decimal"
              min={originalServings ? 1 : 0}
              step={originalServings ? 1 : 0.5}
              value={customValue}
              onChange={e => setCustomValue(e.target.value)}
              style={{
                width: 80, padding: '6px 10px', fontSize: 14, fontWeight: 600,
                border: '1px solid var(--hairline)', borderRadius: 8,
                background: 'var(--background)', color: 'var(--text-primary)',
              }}
            />
            {!originalServings && <span style={{ color: 'var(--text-secondary)' }}>×</span>}
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 8, marginBottom: 12 }}>Ingredients</h3>
      {ingredients.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>No ingredients listed.</p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: 'none', marginBottom: 24, color: 'var(--text-primary)' }}>
          {ingredients.map((ing, i) => (
            <IngredientRow key={i} ing={ing} scaleFactor={scaleFactor} showAddToGrocery={showAddToGrocery} />
          ))}
        </ul>
      )}

      <h3 style={{ marginBottom: 12 }}>Instructions</h3>
      {instructions.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No steps listed.</p>
      ) : (
        <ol style={{ paddingLeft: 24, color: 'var(--text-primary)' }}>
          {instructions.map((inst, i) => (
            <li key={i} style={{ marginBottom: 12 }}>{inst.replace(/<[^>]*>?/gm, '')}</li>
          ))}
        </ol>
      )}
    </>
  );
}
