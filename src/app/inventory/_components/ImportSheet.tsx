"use client";
import { useRef, useState } from 'react';
import { X, Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useDialog } from '@/components/useDialog';
import { buildTemplateCsv, parsePantryCsv, type ImportItem, type ImportResult } from '@/lib/pantry-import';
import { LOCATIONS } from './constants';

/**
 * CSV import for bootstrapping the pantry. The file must match the documented
 * structure (a header row with an Item column); anything else is reported in a
 * preview rather than guessed at, so a malformed sheet can't quietly produce a
 * wrong inventory.
 */
export default function ImportSheet({
  saving,
  onImport,
  onClose,
}: {
  saving: boolean;
  onImport: (items: ImportItem[]) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useDialog(onClose);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'famlihub-pantry-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setShowIssues(false);
    setFileName(file.name);
    if (file.size > 2 * 1024 * 1024) {
      setError('That file is unusually large for a pantry list (over 2 MB).');
      return;
    }
    try {
      setResult(parsePantryCsv(await file.text()));
    } catch {
      setError("Couldn't read that file. Make sure it's a .csv saved from your spreadsheet.");
    }
  };

  const locLabel = (id?: string) => LOCATIONS.find(l => l.id === id)?.label ?? 'Unsorted';

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Import pantry from a spreadsheet"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ marginBottom: 0 }}>Import from spreadsheet</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          >
            <X size={22} />
          </button>
        </div>

        {/* The structure contract, stated up front */}
        <div style={{ padding: '12px 14px', background: 'var(--surface-hover)', borderRadius: 12, marginBottom: 16 }}>
          <p className="text-sm" style={{ color: 'var(--text-primary)', marginBottom: 8 }}>
            Your CSV needs a header row with an <strong>Item</strong> column. <strong>Quantity</strong>,
            {' '}<strong>Weight</strong>, <strong>Location</strong>, and <strong>Level</strong> are optional.
          </p>
          <p className="text-sm" style={{ marginBottom: 10 }}>
            Location must be Pantry, Fridge, or Freezer. Level must be Low, Medium, or High.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={downloadTemplate}
            style={{ width: 'auto', padding: '8px 14px', fontSize: '0.82rem', borderRadius: 999, touchAction: 'manipulation' }}
          >
            <Download size={15} /> Download template
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
          style={{ marginBottom: 12, touchAction: 'manipulation' }}
        >
          <Upload size={18} /> {fileName ? 'Choose a different file' : 'Choose CSV file'}
        </button>
        {fileName && (
          <p className="text-sm" style={{ marginBottom: 12 }}>Selected: {fileName}</p>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{error}</p>}

        {/* Structural rejection — nothing importable */}
        {result?.fatal && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 12, borderRadius: 12, background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{result.fatal}</p>
          </div>
        )}

        {/* Preview */}
        {result && !result.fatal && (
          <>
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 12, borderRadius: 12, background: 'var(--surface-hover)' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1, color: 'var(--success-color)' }} />
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {result.items.length} item{result.items.length === 1 ? '' : 's'} ready to import
                </p>
                <p className="text-sm" style={{ marginTop: 2 }}>
                  Columns used: {(['item', 'quantity', 'location', 'level'] as const)
                    .filter(f => result.matched[f])
                    .map(f => result.matched[f])
                    .join(', ')}
                </p>
              </div>
            </div>

            {result.issues.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowIssues(v => !v)}
                  aria-expanded={showIssues}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', borderRadius: 12, textAlign: 'left',
                    background: 'var(--warning-bg)', color: 'var(--warning-fg)',
                    border: 'none', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 700,
                    touchAction: 'manipulation',
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  {result.issues.length} row{result.issues.length === 1 ? '' : 's'} need attention
                  <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{showIssues ? 'Hide' : 'Show'}</span>
                </button>
                {showIssues && (
                  <ul style={{ listStyle: 'none', padding: '10px 4px 0', margin: 0, maxHeight: 180, overflowY: 'auto' }}>
                    {result.issues.map((iss, i) => (
                      <li key={i} className="text-sm" style={{ marginBottom: 6 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Row {iss.row}:</strong> {iss.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {result.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Preview</label>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {result.items.slice(0, 30).map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.88rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      {(it.quantity || it.weight) && (
                        <span className="text-sm" style={{ flexShrink: 0 }}>
                          {[it.quantity, it.weight].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      <span className="text-sm" style={{ flexShrink: 0, minWidth: 62, textAlign: 'right' }}>{locLabel(it.location)}</span>
                    </div>
                  ))}
                  {result.items.length > 30 && (
                    <p className="text-sm" style={{ paddingTop: 8 }}>…and {result.items.length - 30} more</p>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={saving || result.items.length === 0}
                onClick={async () => {
                  try {
                    await onImport(result.items);
                    onClose();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to import.');
                  }
                }}
                style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
              >
                {saving ? 'Importing…' : `Import ${result.items.length} item${result.items.length === 1 ? '' : 's'}`}
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
          </>
        )}
      </div>
    </div>
  );
}
