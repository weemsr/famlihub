"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LIMITS, capLen } from '@/lib/limits';
import PageHeader from '@/components/PageHeader';
import Fab from '@/components/Fab';
import type { MaintenanceBody, MaintenanceItem } from '@/lib/types';
import { MAINTENANCE_SEEDS } from './seed';
import QuickStart from './_components/QuickStart';
import ItemCard from './_components/ItemCard';
import ItemForm from './_components/ItemForm';
import {
  EMPTY_FORM,
  INTERVAL_PRESETS,
  isoDay,
  statusFor,
  type FormState,
} from './_components/utils';

type MaintFilter = 'all' | 'attention' | 'on-track';
const FILTERS: { id: MaintFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'on-track', label: 'On track' },
];

export default function MaintenancePage() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = isoDay(today);

  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seedBusy, setSeedBusy] = useState<string | 'all' | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [filter, setFilter] = useState<MaintFilter>('all');

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

  // Rank by urgency: the item closest to needing maintenance comes first.
  // `daysFromNow` is days until due (negative = overdue, 0 = due today /
  // never-done), so ascending order surfaces the most-due item at the top.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const ra = statusFor(a.body || { intervalDays: 0 }, todayIso);
      const rb = statusFor(b.body || { intervalDays: 0 }, todayIso);
      if (ra.daysFromNow !== rb.daysFromNow) return ra.daysFromNow - rb.daysFromNow;
      return a.title.localeCompare(b.title);
    });
  }, [items, todayIso]);

  // Counts per filter (anything that isn't on-track needs attention: overdue,
  // due-soon, or never-done).
  const counts = useMemo(() => {
    let attention = 0, onTrack = 0;
    for (const it of items) {
      const { status } = statusFor(it.body || { intervalDays: 0 }, todayIso);
      if (status === 'on-track') onTrack++; else attention++;
    }
    return { all: items.length, attention, 'on-track': onTrack } as Record<MaintFilter, number>;
  }, [items, todayIso]);

  const visibleItems = useMemo(() => {
    if (filter === 'all') return sortedItems;
    return sortedItems.filter(it => {
      const { status } = statusFor(it.body || { intervalDays: 0 }, todayIso);
      return filter === 'attention' ? status !== 'on-track' : status === 'on-track';
    });
  }, [sortedItems, filter, todayIso]);

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
    const title = capLen(form.title.trim(), LIMITS.title);
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
      if (form.note.trim()) body.note = capLen(form.note.trim(), LIMITS.note);

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

  const showQuickStart = loaded && items.length === 0;

  return (
    <div style={{ paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 24px)' }}>
      <PageHeader icon={Wrench} color="#475569" title="Home Maintenance" />

      {!loaded && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      )}

      {showQuickStart && (
        <QuickStart seedBusy={seedBusy} onAddSeed={addSeed} onAddAll={addAllSeeds} />
      )}

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-hover)', padding: 4, borderRadius: 999, marginBottom: 16 }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                style={{
                  flex: 1,
                  padding: '8px 8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  borderRadius: 999,
                  background: active ? 'var(--surface-color)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 4px var(--hairline-strong)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                {f.label} ({counts[f.id]})
              </button>
            );
          })}
        </div>
      )}

      {visibleItems.length > 0 && (
        <div>
          {visibleItems.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              todayIso={todayIso}
              onEdit={openEdit}
              onDelete={deleteItem}
              onMarkDone={markDone}
            />
          ))}
        </div>
      )}

      {loaded && items.length > 0 && visibleItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
          {filter === 'attention' ? 'Nothing needs attention right now. 🎉' : 'Nothing is on track yet.'}
        </p>
      )}

      {loaded && items.length === 0 && !showQuickStart && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tap + to add your first maintenance item.</p>
      )}

      {!isFormOpen && <Fab onClick={openAdd} ariaLabel="Add maintenance item" />}

      {isFormOpen && (
        <ItemForm
          form={form}
          formSaving={formSaving}
          formError={formError}
          onChange={setForm}
          onSave={saveForm}
          onClose={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
}
