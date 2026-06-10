"use client";
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { LIMITS } from '@/lib/limits';
import { INTERVAL_PRESETS, type FormState } from './utils';

export default function ItemForm({
  form,
  formSaving,
  formError,
  onChange,
  onSave,
  onClose,
}: {
  form: FormState;
  formSaving: boolean;
  formError: string | null;
  onChange: (updater: (f: FormState) => FormState) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="bottom-sheet-overlay">
      <div className="bottom-sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ marginBottom: 0 }}>{form.id ? 'Edit item' : 'Add item'}</h2>
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
          <label className="form-label">Name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Oil change"
            value={form.title}
            onChange={e => onChange(f => ({ ...f, title: e.target.value }))}
            maxLength={LIMITS.title}
            style={{ padding: '12px 16px' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Interval</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {INTERVAL_PRESETS.map(p => {
              const active = form.intervalPreset === p.days;
              return (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => onChange(f => ({ ...f, intervalPreset: p.days, intervalDays: p.days }))}
                  style={{
                    padding: '6px 12px', fontSize: '0.82rem', fontWeight: 600,
                    borderRadius: 999,
                    background: active ? 'var(--accent-color)' : 'var(--surface-hover)',
                    color: active ? 'white' : 'var(--text-primary)',
                    border: 'none', cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onChange(f => ({ ...f, intervalPreset: 'custom', customDays: f.customDays || String(f.intervalDays) }))}
              style={{
                padding: '6px 12px', fontSize: '0.82rem', fontWeight: 600,
                borderRadius: 999,
                background: form.intervalPreset === 'custom' ? 'var(--accent-color)' : 'var(--surface-hover)',
                color: form.intervalPreset === 'custom' ? 'white' : 'var(--text-primary)',
                border: 'none', cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              Custom
            </button>
          </div>
          {form.intervalPreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="number"
                min={1}
                className="input"
                value={form.customDays}
                onChange={e => onChange(f => ({ ...f, customDays: e.target.value }))}
                style={{ padding: '10px 14px', width: 120 }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>days</span>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Last done (optional)</label>
          <input
            type="date"
            className="input"
            value={form.lastDone}
            onChange={e => onChange(f => ({ ...f, lastDone: e.target.value }))}
            style={{
              height: 50, borderRadius: 16, padding: '0 16px',
              backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
              appearance: 'none', WebkitAppearance: 'none', fontSize: '1rem',
            }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="form-label">Note (optional)</label>
          <textarea
            className="input"
            placeholder="e.g. Replace with XYZ model filter"
            value={form.note}
            onChange={e => onChange(f => ({ ...f, note: e.target.value }))}
            maxLength={LIMITS.note}
            style={{ borderRadius: 16, height: 80, resize: 'none', padding: '12px 16px' }}
          />
        </div>

        {formError && (
          <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{formError}</p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={onSave}
            disabled={formSaving || !form.title.trim()}
            style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
          >
            {formSaving ? 'Saving…' : form.id ? 'Save changes' : 'Add item'}
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
