"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Wrench, Trash2, Pencil, CheckCircle2, X, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/PageHeader';
import Fab from '@/components/Fab';
import type { MaintenanceBody, MaintenanceItem } from '@/lib/types';
import { MAINTENANCE_SEEDS } from './seed';

type Status = 'overdue' | 'due-soon' | 'on-track' | 'never-done';

interface IntervalPreset {
  days: number;
  label: string;
}

const INTERVAL_PRESETS: IntervalPreset[] = [
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Every 6 months' },
  { days: 365, label: 'Yearly' },
];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(earlierIso: string, laterIso: string): number {
  const [ey, em, ed] = earlierIso.split('-').map(Number);
  const [ly, lm, ld] = laterIso.split('-').map(Number);
  const a = Date.UTC(ey, em - 1, ed);
  const b = Date.UTC(ly, lm - 1, ld);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function statusFor(body: MaintenanceBody, todayIso: string): { status: Status; daysFromNow: number } {
  if (!body.lastDone) return { status: 'never-done', daysFromNow: 0 };
  const elapsed = daysBetween(body.lastDone, todayIso);
  const daysFromNow = body.intervalDays - elapsed;
  if (daysFromNow < 0) return { status: 'overdue', daysFromNow };
  if (daysFromNow <= 14) return { status: 'due-soon', daysFromNow };
  return { status: 'on-track', daysFromNow };
}

function statusRank(s: Status): number {
  return { overdue: 0, 'due-soon': 1, 'never-done': 2, 'on-track': 3 }[s];
}

function fmtInterval(days: number): string {
  const preset = INTERVAL_PRESETS.find(p => p.days === days);
  if (preset) return preset.label;
  if (days === 1) return 'Daily';
  if (days === 7) return 'Weekly';
  if (days % 365 === 0) return `Every ${days / 365} year${days === 365 ? '' : 's'}`;
  if (days % 30 === 0) return `Every ${days / 30} months`;
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  return `Every ${days} days`;
}

function fmtDateFriendly(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface FormState {
  id?: string;          // set when editing
  title: string;
  intervalDays: number;
  intervalPreset: number | 'custom';
  customDays: string;
  lastDone: string;     // ISO or ''
  note: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  intervalDays: 180,
  intervalPreset: 180,
  customDays: '',
  lastDone: '',
  note: '',
};

export default function MaintenancePage() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = isoDay(today);

  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seedBusy, setSeedBusy] = useState<string | 'all' | null>(null);

  // Form state (add or edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setLoaded(true); return; }
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('type', 'maintenance')
      .order('created_at', { ascending: true });
    if (data) setItems(data as unknown as MaintenanceItem[]);
    setLoaded(true);
  }, []);

  const loadRef = useRef(loadItems);
  useEffect(() => { loadRef.current = loadItems; }, [loadItems]);

  useEffect(() => {
    loadRef.current();
    const channel = supabase
      .channel('realtime:maintenance')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: 'type=eq.maintenance' },
        () => loadRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Sort: overdue → due-soon → never-done → on-track, stable within group.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const sa = statusFor(a.body || { intervalDays: 0 }, todayIso).status;
      const sb = statusFor(b.body || { intervalDays: 0 }, todayIso).status;
      if (sa !== sb) return statusRank(sa) - statusRank(sb);
      // within same status, sort by name
      return a.title.localeCompare(b.title);
    });
  }, [items, todayIso]);

  // ---- Mutations ----

  const addItem = async (title: string, intervalDays: number, lastDone?: string, note?: string): Promise<boolean> => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return false;
    const body: MaintenanceBody = { intervalDays };
    if (lastDone) body.lastDone = lastDone;
    if (note) body.note = note;
    const { error } = await supabase.from('items').insert({
      type: 'maintenance',
      title,
      body,
      user_id: userData.user.id,
    });
    if (!error) await loadItems();
    return !error;
  };

  const addSeed = async (index: number) => {
    const seed = MAINTENANCE_SEEDS[index];
    setSeedBusy(seed.title);
    await addItem(seed.title, seed.intervalDays);
    setSeedBusy(null);
  };

  const addAllSeeds = async () => {
    setSeedBusy('all');
    for (const seed of MAINTENANCE_SEEDS) {
      await addItem(seed.title, seed.intervalDays);
    }
    setSeedBusy(null);
  };

  const markDone = async (item: MaintenanceItem) => {
    const nextBody: MaintenanceBody = { ...(item.body || { intervalDays: 180 }), lastDone: todayIso };
    const prev = items;
    setItems(items.map(i => i.id === item.id ? { ...i, body: nextBody } : i));
    const { error } = await supabase.from('items').update({ body: nextBody }).eq('id', item.id);
    if (error) setItems(prev);
  };

  const deleteItem = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this maintenance item?')) return;
    const prev = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setItems(prev);
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (item: MaintenanceItem) => {
    const body = item.body || { intervalDays: 180 };
    const preset = INTERVAL_PRESETS.find(p => p.days === body.intervalDays)?.days ?? 'custom';
    setForm({
      id: item.id,
      title: item.title,
      intervalDays: body.intervalDays,
      intervalPreset: preset,
      customDays: preset === 'custom' ? String(body.intervalDays) : '',
      lastDone: body.lastDone || '',
      note: body.note || '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const saveForm = async () => {
    const title = form.title.trim();
    if (!title) { setFormError('Give this item a name.'); return; }

    const intervalDays = form.intervalPreset === 'custom'
      ? Math.max(1, parseInt(form.customDays, 10) || 0)
      : form.intervalPreset;
    if (!intervalDays || intervalDays < 1) {
      setFormError('Interval must be at least 1 day.');
      return;
    }

    setFormSaving(true);
    setFormError(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');

      const body: MaintenanceBody = { intervalDays };
      if (form.lastDone) body.lastDone = form.lastDone;
      if (form.note.trim()) body.note = form.note.trim();

      if (form.id) {
        const { error } = await supabase.from('items').update({ title, body }).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('items').insert({
          type: 'maintenance',
          title,
          body,
          user_id: userData.user.id,
        });
        if (error) throw error;
      }
      setIsFormOpen(false);
      await loadItems();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setFormSaving(false);
    }
  };

  // Close form on Escape.
  useEffect(() => {
    if (!isFormOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFormOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormOpen]);

  // ---- Render helpers ----

  const renderStatusPill = (status: Status, daysFromNow: number) => {
    const styles = {
      overdue: { bg: '#fee2e2', fg: '#991b1b', label: `${Math.abs(daysFromNow)} day${Math.abs(daysFromNow) === 1 ? '' : 's'} overdue` },
      'due-soon': { bg: '#fef3c7', fg: '#92400e', label: daysFromNow === 0 ? 'Due today' : `Due in ${daysFromNow} day${daysFromNow === 1 ? '' : 's'}` },
      'on-track': { bg: '#dcfce7', fg: '#166534', label: `Next in ${daysFromNow} day${daysFromNow === 1 ? '' : 's'}` },
      'never-done': { bg: 'var(--surface-hover)', fg: 'var(--text-secondary)', label: 'Never done' },
    }[status];
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '3px 10px', borderRadius: 999,
        background: styles.bg, color: styles.fg,
        fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.2,
      }}>
        {styles.label}
      </span>
    );
  };

  const renderItemCard = (item: MaintenanceItem) => {
    const body = item.body || { intervalDays: 180 };
    const { status, daysFromNow } = statusFor(body, todayIso);

    return (
      <div
        key={item.id}
        className="card"
        style={{
          padding: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>{item.title}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{fmtInterval(body.intervalDays)}</div>
          </div>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => openEdit(item)}
              aria-label="Edit"
              style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', touchAction: 'manipulation' }}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => deleteItem(item.id)}
              aria-label="Delete"
              style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', touchAction: 'manipulation' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          {renderStatusPill(status, daysFromNow)}
          {body.lastDone && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Last done {fmtDateFriendly(body.lastDone)}
            </span>
          )}
        </div>

        {body.note && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
            {body.note}
          </div>
        )}

        <button
          type="button"
          onClick={() => markDone(item)}
          className="btn"
          style={{ width: 'auto', padding: '8px 14px', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: 6, touchAction: 'manipulation' }}
        >
          <CheckCircle2 size={16} /> Mark done today
        </button>
      </div>
    );
  };

  const showQuickStart = loaded && items.length === 0;

  return (
    <div style={{ paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 24px)' }}>
      <PageHeader icon={Wrench} color="#475569" title="Home Maintenance" />

      {!loaded && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      )}

      {/* Quick-start card */}
      {showQuickStart && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Quick start</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
            Tap any to add with a sensible default interval, or grab them all at once.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {MAINTENANCE_SEEDS.map((seed, i) => (
              <button
                key={seed.title}
                type="button"
                onClick={() => addSeed(i)}
                disabled={seedBusy !== null}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '12px 14px', borderRadius: 12,
                  background: 'var(--surface-hover)', border: 'none',
                  cursor: seedBusy ? 'default' : 'pointer',
                  textAlign: 'left', color: 'var(--text-primary)', touchAction: 'manipulation',
                  opacity: seedBusy !== null && seedBusy !== seed.title && seedBusy !== 'all' ? 0.6 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{seed.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {seed.intervalLabel}{seed.hint ? ` · ${seed.hint}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-color)', flexShrink: 0 }}>
                  {seedBusy === seed.title || seedBusy === 'all' ? 'Adding…' : '+ Add'}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn"
            onClick={addAllSeeds}
            disabled={seedBusy !== null}
            style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
          >
            {seedBusy === 'all' ? 'Adding all…' : 'Add all 6'}
          </button>
        </div>
      )}

      {/* Item list */}
      {sortedItems.length > 0 && (
        <div>
          {sortedItems.map(renderItemCard)}
        </div>
      )}

      {/* Empty state when not showing quick-start */}
      {loaded && items.length === 0 && !showQuickStart && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tap + to add your first maintenance item.</p>
      )}

      {/* FAB */}
      {!isFormOpen && <Fab onClick={openAdd} ariaLabel="Add maintenance item" />}

      {/* Add / edit modal */}
      {isFormOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface-color)', width: '100%', maxWidth: 600,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
            animation: 'slideUp 0.25s ease-out forwards',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ marginBottom: 0 }}>{form.id ? 'Edit item' : 'Add item'}</h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
              >
                <X size={22} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Oil change"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={{ padding: '12px 16px' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Interval</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {INTERVAL_PRESETS.map(p => {
                  const active = form.intervalPreset === p.days;
                  return (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, intervalPreset: p.days, intervalDays: p.days }))}
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
                  onClick={() => setForm(f => ({ ...f, intervalPreset: 'custom', customDays: f.customDays || String(f.intervalDays) }))}
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
                    onChange={e => setForm(f => ({ ...f, customDays: e.target.value }))}
                    style={{ padding: '10px 14px', width: 120 }}
                  />
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>days</span>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Last done (optional)</label>
              <input
                type="date"
                className="input"
                value={form.lastDone}
                onChange={e => setForm(f => ({ ...f, lastDone: e.target.value }))}
                style={{
                  height: 50, borderRadius: 16, padding: '0 16px',
                  backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)',
                  appearance: 'none', WebkitAppearance: 'none', fontSize: '1rem',
                }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Note (optional)</label>
              <textarea
                className="input"
                placeholder="e.g. Replace with XYZ model filter"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
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
                onClick={saveForm}
                disabled={formSaving || !form.title.trim()}
                style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
              >
                {formSaving ? 'Saving…' : form.id ? 'Save changes' : 'Add item'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsFormOpen(false)}
                style={{ width: 'auto', padding: '10px 18px', touchAction: 'manipulation' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
