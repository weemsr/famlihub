"use client";
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { LIMITS } from '@/lib/limits';
import { type FormState } from './utils';

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
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ marginBottom: 0 }}>{form.id ? 'Edit card' : 'Add card'}</h2>
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
          <label className="form-label" htmlFor="cc-title">Card name</label>
          <input
            id="cc-title"
            type="text"
            className="input"
            placeholder="e.g. Sapphire Preferred"
            value={form.title}
            onChange={e => onChange(f => ({ ...f, title: e.target.value }))}
            maxLength={LIMITS.title}
            style={{ padding: '12px 16px' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label" htmlFor="cc-bank">CC Company / Bank</label>
          <input
            id="cc-bank"
            type="text"
            className="input"
            placeholder="e.g. Chase, Amex, Capital One"
            value={form.bank}
            onChange={e => onChange(f => ({ ...f, bank: e.target.value }))}
            maxLength={LIMITS.title}
            style={{ padding: '12px 16px' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label" htmlFor="cc-fee">Annual fee</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', fontWeight: 600 }}>$</span>
            <input
              id="cc-fee"
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              className="input"
              placeholder="0"
              value={form.annualFee}
              onChange={e => onChange(f => ({ ...f, annualFee: e.target.value }))}
              style={{ padding: '12px 16px' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label" htmlFor="cc-cancel">Cancel by (date)</label>
          <input
            id="cc-cancel"
            type="date"
            className="input"
            value={form.cancelBy}
            onChange={e => onChange(f => ({ ...f, cancelBy: e.target.value }))}
            style={{
              height: 50, borderRadius: 16, padding: '0 16px',
              backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
              appearance: 'none', WebkitAppearance: 'none', fontSize: '1rem',
            }}
          />
          <p className="text-sm" style={{ marginTop: 6 }}>
            The date by which you need to decide whether to cancel before the next annual fee posts.
          </p>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="form-label" htmlFor="cc-notes">Notes (optional)</label>
          <textarea
            id="cc-notes"
            className="input"
            placeholder="e.g. Cardmember since 2022, downgrade option to Freedom"
            value={form.notes}
            onChange={e => onChange(f => ({ ...f, notes: e.target.value }))}
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
            {formSaving ? 'Saving…' : form.id ? 'Save changes' : 'Add card'}
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
