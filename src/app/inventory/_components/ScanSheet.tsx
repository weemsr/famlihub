"use client";
import { useRef, useState } from 'react';
import Image from 'next/image';
import { X, Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { mergeScanItems } from '@/lib/pantry-merge';
import type { ScanItem } from '@/lib/pantry-scan';
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
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProviderResult[] | null>(null);
  const [chosenProvider, setChosenProvider] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [drafts, setDrafts] = useState<ScanDraft[]>([]);
  const [importing, setImporting] = useState(false);
  // With multiple providers configured, compare them on the same photo so the
  // user can see which reads their shelves best before settling on one.
  const [compare, setCompare] = useState(providers.length > 1);

  const showDrafts = (items: ProviderResult['items']) =>
    setDrafts(items.map(i => ({ name: i.name, quantity: i.quantity ?? '', weight: i.weight ?? '', level: i.level, keep: true })));

  /**
   * Scan a batch of shelf photos. Each photo is a separate request (kept small
   * and independently retryable); at most 3 run at once so a 15-photo batch
   * doesn't open 15 sockets or hit provider rate limits. Results across photos
   * are merged so overlapping shots don't produce a list of duplicates.
   */
  const handleFiles = async (files: File[]) => {
    setError(null);
    setResults(null);
    setDrafts([]);
    setFailedCount(0);
    setPhotoCount(files.length);
    setProgress({ done: 0, total: files.length });
    setScanning(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) throw new Error('Session expired — sign in again.');

      const ids = compare ? providers.map(p => p.id) : [providers[0].id];
      const thumbs: string[] = [];
      // Per-provider accumulation so the comparison view still works on a batch.
      const byProvider = new Map<string, { label: string; batches: ScanItem[][]; ms: number; errors: string[] }>();
      let failures = 0;

      const scanOne = async (file: File) => {
        try {
          const { base64, mediaType, preview } = await downscale(file);
          if (thumbs.length < 6) thumbs.push(preview);

          const res = await fetch('/api/pantry-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ imageBase64: base64, mediaType, providerIds: ids }),
          });
          const json = await res.json() as { results?: ProviderResult[]; error?: string };
          if (!res.ok) throw new Error(json.error || `Scan failed (${res.status})`);

          for (const r of json.results ?? []) {
            const acc = byProvider.get(r.providerId) ?? { label: r.label, batches: [], ms: 0, errors: [] };
            if (r.items.length > 0) acc.batches.push(r.items);
            if (r.error) acc.errors.push(r.error);
            acc.ms += r.elapsedMs;
            byProvider.set(r.providerId, acc);
          }
        } catch {
          failures++; // one bad photo shouldn't abort the batch
        } finally {
          setProgress(p => ({ ...p, done: p.done + 1 }));
        }
      };

      // Simple concurrency pool of 3.
      const queue = [...files];
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (;;) {
          const next = queue.shift();
          if (!next) return;
          await scanOne(next);
        }
      }));

      setPreviews(thumbs);
      setFailedCount(failures);

      const merged: ProviderResult[] = [...byProvider.entries()].map(([providerId, acc]) => ({
        providerId,
        label: acc.label,
        items: mergeScanItems(acc.batches),
        elapsedMs: acc.ms,
        ...(acc.batches.length === 0 ? { error: acc.errors[0] ?? 'No items recognized.' } : {}),
      }));
      setResults(merged);

      const best = [...merged].sort((a, b) => b.items.length - a.items.length)[0];
      if (best && best.items.length > 0) {
        setChosenProvider(best.providerId);
        showDrafts(best.items);
      } else if (failures === files.length) {
        setError('None of those photos could be read. Check your connection and try again.');
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
        aria-label="Scan shelf photos"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ marginBottom: 0 }}>Scan shelves</h2>
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
                Compare all {providers.length} models on these photos
              </label>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) handleFiles(files.slice(0, 20));
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
              {scanning
                ? <><Loader2 size={18} className="spin" /> Reading photo {Math.min(progress.done + 1, progress.total)} of {progress.total}…</>
                : <><Camera size={18} /> Select shelf photos</>}
            </button>
            <p className="text-sm" style={{ marginBottom: 12 }}>
              Pick every photo of this area at once — up to 20. Duplicates across
              photos are merged automatically. Photos are never saved.
            </p>
          </>
        )}

        {scanning && progress.total > 1 && (
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden', marginBottom: 12 }}>
            <div
              style={{
                height: '100%', borderRadius: 999, background: 'var(--accent-color)',
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
                transition: 'width 200ms ease',
              }}
            />
          </div>
        )}

        {previews.length > 0 && drafts.length === 0 && !scanning && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
            {previews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                <Image src={src} alt="" fill sizes="72px" style={{ objectFit: 'cover' }} unoptimized />
              </div>
            ))}
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
            <label className="form-label">
              Found {drafts.length} items across {photoCount} photo{photoCount === 1 ? '' : 's'} — uncheck any that are wrong
            </label>
            {failedCount > 0 && (
              <p className="text-sm" style={{ color: 'var(--warning-fg)', marginBottom: 8 }}>
                {failedCount} photo{failedCount === 1 ? '' : 's'} couldn&apos;t be read and {failedCount === 1 ? 'was' : 'were'} skipped.
              </p>
            )}
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
                onClick={() => { setDrafts([]); setResults(null); setPreviews([]); setPhotoCount(0); setFailedCount(0); }}
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
