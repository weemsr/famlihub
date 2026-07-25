"use client";
import { useState } from 'react';
import { X } from 'lucide-react';
import type { PantryLocation } from '@/lib/types';
import { useDialog } from '@/components/useDialog';
import { LOCATIONS, parseBulkLines } from './constants';

/**
 * Bulk capture sheet: the fast path for building a base inventory from shelf
 * photos. One item name per line, a single location for the whole batch (you're
 * looking at one shelf), quantities refined later in the list.
 */
export default function BulkAddSheet({
  defaultLocation,
  saving,
  error,
  onSave,
  onClose,
}: {
  defaultLocation: PantryLocation;
  saving: boolean;
  error: string | null;
  onSave: (names: string[], location: PantryLocation) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialog(onClose);
  const [text, setText] = useState('');
  const [location, setLocation] = useState<PantryLocation>(defaultLocation);

  const names = parseBulkLines(text);

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add many pantry items"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ marginBottom: 0 }}>Add many items</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          >
            <X size={22} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Where is this?</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {LOCATIONS.map(loc => {
              const active = location === loc.id;
              const Icon = loc.icon;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setLocation(loc.id)}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px 8px', fontSize: '0.85rem', fontWeight: 700,
                    borderRadius: 999,
                    background: active ? 'var(--accent-color)' : 'var(--surface-hover)',
                    color: active ? 'white' : 'var(--text-primary)',
                    border: 'none', cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  <Icon size={15} /> {loc.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label" htmlFor="bulk-items">One item per line</label>
          <textarea
            id="bulk-items"
            className="input"
            placeholder={'Rice\nBlack beans\nOlive oil\nPaprika'}
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ height: 220, resize: 'none', padding: '12px 16px', lineHeight: 1.7 }}
          />
          <p className="text-sm" style={{ marginTop: 6 }}>
            Paste a list or type from your shelf photo. Add quantities afterwards by
            tapping any item.
          </p>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => onSave(names, location)}
            disabled={saving || names.length === 0}
            style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
          >
            {saving ? 'Adding…' : names.length > 0 ? `Add ${names.length} item${names.length === 1 ? '' : 's'}` : 'Add items'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
