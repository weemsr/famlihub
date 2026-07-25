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
  onLevel,
  onDelete,
}: {
  item: InventoryItem;
  onQuantity: (id: string, quantity: string) => void;
  onLevel: (id: string, level: PantryLevel | undefined) => void;
  onDelete: (id: string) => void;
}) {
  const body = item.body || {};
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body.quantity || '');

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== (body.quantity || '')) onQuantity(item.id, next);
  };

  const levelMeta = LEVELS.find(l => l.id === body.level);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--hairline)' }}>
      <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.title}
      </span>

      {editing ? (
        <input
          autoFocus
          type="text"
          className="input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(body.quantity || ''); setEditing(false); }
          }}
          placeholder="qty"
          maxLength={LIMITS.title}
          style={{ width: 96, padding: '4px 10px', fontSize: '0.82rem', flexShrink: 0 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(body.quantity || ''); setEditing(true); }}
          aria-label={`Set quantity for ${item.title}`}
          style={{
            flexShrink: 0, minWidth: 56, padding: '4px 10px', borderRadius: 999,
            background: 'var(--surface-hover)',
            color: body.quantity ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: 'none', fontSize: '0.8rem', fontWeight: 600,
            cursor: 'pointer', touchAction: 'manipulation',
          }}
        >
          {body.quantity || 'qty'}
        </button>
      )}

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
