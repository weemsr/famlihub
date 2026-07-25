"use client";
import { useRef, useState } from 'react';
import Image from 'next/image';
import { X, Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LIMITS } from '@/lib/limits';
import type { PantryLevel, PantryLocation } from '@/lib/types';
import { useDialog } from '@/components/useDialog';
import { LEVELS, LOCATIONS, nextLevel } from './constants';

export interface ScanDraft {
  name: string;
  quantity: string;
  weight: string;
  level?: PantryLevel;
  keep: boolean;
}

interface ProviderInfo { id: string; label: string }
interface ProviderResult {
  providerId: string;
  label: string;
  items: { name: string; quantity?: string; weight?: string; level?: PantryLevel }[];
  elapsedMs: number;
  error?: string;
}

/** Downscale in-browser: smaller upload, lower cost, faster round trip. */
async function downscale(file: File, maxEdge = 1536): Promise<{ base64: string; mediaType: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that photo.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return { base64: dataUrl.split(',')[1] ?? '', mediaType: 'image/jpeg', preview: dataUrl };
}

export default function ScanSheet({
  providers,
  defaultLocation,
  onImport,
  onClose,
}: {
  providers: ProviderInfo[];
  defaultLocation: PantryLocation;
  onImport: (items: ScanDraft[], location: PantryLocation) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useDialog(onClose);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [location, setLocation] = useState<PantryLocation>(defaultLocation);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProviderResult[] | null>(null);
  const [chosenProvider, setChosenProvider] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ScanDraft[]>([]);
  const [importing, setImporting] = useState(false);
  // With multiple providers configured, compare them on the same photo so the
  // user can see which reads their shelves best before settling on one.
  const [compare, setCompare] = useState(providers.length > 1);

  const showDrafts = (items: ProviderResult['items']) =>
    setDrafts(items.map(i => ({ name: i.name, quantity: i.quantity ?? '', weight: i.weight ?? '', level: i.level, keep: true })));

  const handleFile = async (file: File) => {
    setError(null);
    setResults(null);
    setDrafts([]);
    setScanning(true);
    try {
      const { base64, mediaType, preview: dataUrl } = await downscale(file);
      setPreview(dataUrl);

      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) throw new Error('Session expired — sign in again.');

      const ids = compare ? providers.map(p => p.id) : [providers[0].id];
      const res = await fetch('/api/pantry-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ imageBase64: base64, mediaType, providerIds: ids }),
      });
      const json = await res.json() as { results?: ProviderResult[]; error?: string };
      if (!res.ok) throw new Error(json.error || `Scan failed (${res.status})`);

      const list = json.results ?? [];
      setResults(list);
      const best = [...list].sort((a, b) => b.items.length - a.items.length)[0];
      if (best && best.items.length > 0) {
        setChosenProvider(best.providerId);
        showDrafts(best.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setScanning(false);
    }
  };

  const patch = (idx: number, next: Partial<ScanDraft>) =>
    setDrafts(prev => prev.map((d, i) => (i === idx ? { ...d, ...next } : d)));

  const keepCount = drafts.filter(d => d.keep).length;

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Scan a shelf photo"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ marginBottom: 0 }}>Scan a shelf</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Step 1 — where, then shoot */}
        {drafts.length === 0 && (
          <>
            <label className="form-label">Where is this shelf?</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
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
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '10px 8px', fontSize: '0.85rem', fontWeight: 700, borderRadius: 999,
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

            {providers.length > 1 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" className="checkbox-input" checked={compare} onChange={e => setCompare(e.target.checked)} />
                Compare all {providers.length} models on this photo
              </label>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
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
              disabled={scanning}
              onClick={() => fileRef.current?.click()}
              style={{ marginBottom: 12, touchAction: 'manipulation' }}
            >
              {scanning ? <><Loader2 size={18} className="spin" /> Reading shelf…</> : <><Camera size={18} /> Take photo</>}
            </button>
            <p className="text-sm" style={{ marginBottom: 12 }}>
              Photos are used only to identify items and are never saved.
            </p>
          </>
        )}

        {preview && drafts.length === 0 && (
          <div style={{ position: 'relative', width: '100%', height: 160, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <Image src={preview} alt="Shelf preview" fill sizes="(max-width: 600px) 100vw, 600px" style={{ objectFit: 'cover' }} unoptimized />
          </div>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--danger-color)', marginBottom: 12 }}>{error}</p>}

        {/* Step 2 — compare providers when more than one ran */}
        {results && results.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Results by model</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map(r => {
                const active = chosenProvider === r.providerId;
                return (
                  <button
                    key={r.providerId}
                    type="button"
                    disabled={r.items.length === 0}
                    onClick={() => { setChosenProvider(r.providerId); showDrafts(r.items); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '10px 14px', borderRadius: 12, textAlign: 'left',
                      background: active ? 'var(--surface-hover)' : 'transparent',
                      border: `1px solid ${active ? 'var(--accent-color)' : 'var(--hairline-strong)'}`,
                      cursor: r.items.length === 0 ? 'default' : 'pointer',
                      opacity: r.items.length === 0 ? 0.6 : 1,
                      color: 'var(--text-primary)', touchAction: 'manipulation',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.label}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {r.error ? r.error : `${r.items.length} items · ${(r.elapsedMs / 1000).toFixed(1)}s`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3 — review before anything is written */}
        {drafts.length > 0 && (
          <>
            <label className="form-label">Found {drafts.length} items — uncheck any that are wrong</label>
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
              {drafts.map((d, i) => {
                const levelMeta = LEVELS.find(l => l.id === d.level);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--hairline)', opacity: d.keep ? 1 : 0.45 }}>
                    <input
                      type="checkbox"
                      className="checkbox-input"
                      checked={d.keep}
                      onChange={e => patch(i, { keep: e.target.checked })}
                      aria-label={`Include ${d.name}`}
                    />
                    <input
                      type="text"
                      className="input"
                      value={d.name}
                      onChange={e => patch(i, { name: e.target.value })}
                      maxLength={LIMITS.title}
                      style={{ flex: 1, minWidth: 0, padding: '6px 12px', fontSize: '0.88rem' }}
                    />
                    <input
                      type="text"
                      className="input"
                      value={d.quantity}
                      onChange={e => patch(i, { quantity: e.target.value })}
                      placeholder="qty"
                      maxLength={LIMITS.title}
                      style={{ width: 62, flexShrink: 0, padding: '6px 8px', fontSize: '0.8rem' }}
                    />
                    <input
                      type="text"
                      className="input"
                      value={d.weight}
                      onChange={e => patch(i, { weight: e.target.value })}
                      placeholder="wt"
                      maxLength={LIMITS.title}
                      style={{ width: 62, flexShrink: 0, padding: '6px 8px', fontSize: '0.8rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => patch(i, { level: nextLevel(d.level) })}
                      aria-label={`Stock level for ${d.name}`}
                      style={{
                        width: 46, flexShrink: 0, padding: '5px 0', borderRadius: 999,
                        background: levelMeta ? 'var(--surface-hover)' : 'transparent',
                        color: levelMeta?.color ?? 'var(--text-secondary)',
                        border: levelMeta ? 'none' : '1px dashed var(--hairline-strong)',
                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
                      }}
                    >
                      {levelMeta?.label ?? '—'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={importing || keepCount === 0}
                onClick={async () => {
                  setImporting(true);
                  setError(null);
                  try {
                    await onImport(drafts.filter(d => d.keep), location);
                    onClose();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to add items.');
                  } finally {
                    setImporting(false);
                  }
                }}
                style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
              >
                {importing ? 'Adding…' : `Add ${keepCount} item${keepCount === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setDrafts([]); setResults(null); setPreview(null); }}
                style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
              >
                New photo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
