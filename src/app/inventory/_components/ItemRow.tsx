"use client";
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { InventoryItem, PantryLevel } from '@/lib/types';
import { LIMITS } from '@/lib/limits';
import { LEVELS, nextLevel } from './constants';

/**
 * One pantry row. Quantity is edited in place (tap → input → Enter/blur saves)
 * and the level chip cycles Low → Med → High → none, so refining a freshly
 * captured list never requires opening a form.
 */
export default function ItemRow({
  item,
  onQuantity,
  onWeight,
  onLevel,
  onDelete,
}: {
  item: InventoryItem;
  onQuantity: (id: string, quantity: string) => void;
  onWeight: (id: string, weight: string) => void;
  onLevel: (id: string, level: PantryLevel | undefined) => void;
  onDelete: (id: string) => void;
}) {
  const body = item.body || {};
  // Which field is being edited inline, if any.
  const [editing, setEditing] = useState<null | 'quantity' | 'weight'>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (field: 'quantity' | 'weight') => {
    setDraft((field === 'quantity' ? body.quantity : body.weight) || '');
    setEditing(field);
  };

  const commit = () => {
    const field = editing;
    setEditing(null);
    if (!field) return;
    const next = draft.trim();
    const current = (field === 'quantity' ? body.quantity : body.weight) || '';
    if (next === current) return;
    if (field === 'quantity') onQuantity(item.id, next);
    else onWeight(item.id, next);
  };

  const levelMeta = LEVELS.find(l => l.id === body.level);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0', borderBottom: '1px solid var(--hairline)' }}>
      {/* Clamp to two lines: scanned names can be verbose ("extra virgin olive
          oil, cold pressed") and unbounded wrapping made rows five lines tall. */}
      <span
        title={item.title}
        style={{
          fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden',
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
          lineHeight: 1.35, wordBreak: 'break-word',
        }}
      >
        {item.title}
      </span>

      {(['quantity', 'weight'] as const).map(field => {
        const value = field === 'quantity' ? body.quantity : body.weight;
        const placeholder = field === 'quantity' ? 'qty' : 'wt';
        if (editing === field) {
          return (
            <input
              key={field}
              autoFocus
              type="text"
              className="input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(null);
              }}
              placeholder={placeholder}
              maxLength={LIMITS.title}
              style={{ width: 84, padding: '4px 8px', fontSize: '0.8rem', flexShrink: 0 }}
            />
          );
        }
        return (
          <button
            key={field}
            type="button"
            onClick={() => startEdit(field)}
            aria-label={`Set ${field} for ${item.title}`}
            style={{
              flexShrink: 0, minWidth: 46, maxWidth: 84, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              padding: '4px 8px', borderRadius: 999,
              background: 'var(--surface-hover)',
              color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none', fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            {value || placeholder}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onLevel(item.id, nextLevel(body.level))}
        aria-label={`Stock level for ${item.title}: ${levelMeta?.label ?? 'not set'}`}
        style={{
          flexShrink: 0, width: 46, padding: '4px 0', borderRadius: 999,
          background: levelMeta ? 'var(--surface-hover)' : 'transparent',
          color: levelMeta?.color ?? 'var(--text-secondary)',
          border: levelMeta ? 'none' : '1px dashed var(--hairline-strong)',
          fontSize: '0.72rem', fontWeight: 700,
          cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        {levelMeta?.label ?? '—'}
      </button>

      <button
        type="button"
        aria-label={`Delete ${item.title}`}
        className="btn"
        style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto', flexShrink: 0 }}
        onClick={() => onDelete(item.id)}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
