"use client";
import Image from 'next/image';
import { ChevronDown, ChevronUp, Trash2, Edit2 } from 'lucide-react';
import { asStringArray, type RecipeBody } from '@/lib/types';
import { safeImageUrl, safeHttpUrl } from '@/lib/url';
import IngredientRow from './IngredientRow';

export interface RecipeItem {
  id: string;
  title: string;
  body: RecipeBody;
}

export default function RecipeCard({
  recipe,
  isExpanded,
  onToggleExpand,
  isEditing,
  editTitle,
  editIngredients,
  editInstructions,
  onStartEdit,
  onSaveEdit,
  onChangeEditTitle,
  onChangeEditIngredients,
  onChangeEditInstructions,
  onDelete,
}: {
  recipe: RecipeItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isEditing: boolean;
  editTitle: string;
  editIngredients: string;
  editInstructions: string;
  onStartEdit: (recipe: RecipeItem, e: React.MouseEvent) => void;
  onSaveEdit: (e: React.MouseEvent) => void;
  onChangeEditTitle: (v: string) => void;
  onChangeEditIngredients: (v: string) => void;
  onChangeEditInstructions: (v: string) => void;
  onDelete: (id: string) => void;
}) {
  const body: RecipeBody = recipe.body || {};
  const safeImage = safeImageUrl(body.image);
  const safeSource = safeHttpUrl(body.sourceUrl);

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)' }}>
      <div
        style={{ padding: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => !isEditing && onToggleExpand()}
      >
        <div style={{ flex: 1, paddingRight: 16 }}>
          {isEditing ? (
            <input
              type="text"
              className="input"
              onClick={e => e.stopPropagation()}
              value={editTitle}
              onChange={e => onChangeEditTitle(e.target.value)}
              style={{ fontWeight: 700, fontSize: '1.1rem', padding: '8px 16px' }}
            />
          ) : (
            <>
              <h3 style={{ marginBottom: 4 }}>{recipe.title}</h3>
              {safeSource && (
                <a
                  href={safeSource}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-sm"
                  style={{ color: 'var(--accent-color)', fontWeight: 600 }}
                  onClick={e => e.stopPropagation()}
                >
                  Original Link
                </a>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isEditing ? (
            <button className="btn" style={{ padding: '6px 16px', width: 'auto', background: 'var(--success-color)' }} onClick={onSaveEdit}>Save</button>
          ) : (
            <>
              <button
                className="btn"
                style={{ padding: '4px 8px', background: 'transparent', color: 'var(--text-secondary)', width: 'auto' }}
                onClick={e => onStartEdit(recipe, e)}
              >
                <Edit2 size={18} />
              </button>
              <button
                className="btn"
                style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto' }}
                onClick={e => { e.stopPropagation(); onDelete(recipe.id); }}
              >
                <Trash2 size={20} />
              </button>
              {isExpanded ? <ChevronUp size={20} className="text-secondary" /> : <ChevronDown size={20} className="text-secondary" />}
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '0 20px 24px 20px' }}>
          {safeImage && !isEditing && (
            <div style={{ position: 'relative', width: '100%', height: 250, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
              <Image
                src={safeImage}
                alt={recipe.title}
                fill
                sizes="(max-width: 800px) 100vw, 800px"
                style={{ objectFit: 'cover' }}
                unoptimized
              />
            </div>
          )}

          <h3 style={{ marginTop: 8, marginBottom: 12 }}>Ingredients</h3>
          {isEditing ? (
            <textarea
              className="input mb-4"
              style={{ height: 200, resize: 'none' }}
              value={editIngredients}
              onChange={e => onChangeEditIngredients(e.target.value)}
              placeholder="One ingredient per line"
            />
          ) : (
            <ul style={{ paddingLeft: 0, listStyle: 'none', marginBottom: 24, color: 'var(--text-primary)' }}>
              {asStringArray(body.ingredients).map((ing, i) => <IngredientRow key={i} ing={ing} />)}
            </ul>
          )}

          <h3 style={{ marginBottom: 12 }}>Instructions</h3>
          {isEditing ? (
            <textarea
              className="input mb-4"
              style={{ height: 250, resize: 'none' }}
              value={editInstructions}
              onChange={e => onChangeEditInstructions(e.target.value)}
              placeholder="One step per line"
            />
          ) : (
            <ol style={{ paddingLeft: 24, color: 'var(--text-primary)' }}>
              {asStringArray(body.instructions).map((inst, i) => (
                <li key={i} style={{ marginBottom: 12 }}>{inst.replace(/<[^>]*>?/gm, '')}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
