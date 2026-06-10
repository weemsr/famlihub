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
  statusRank,
  type FormState,
} from './_components/utils';

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

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const sa = statusFor(a.body || { intervalDays: 0 }, todayIso).status;
      const sb = statusFor(b.body || { intervalDays: 0 }, todayIso).status;
      if (sa !== sb) return statusRank(sa) - statusRank(sb);
      return a.title.localeCompare(b.title);
    });
  }, [items, todayIso]);

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

      {sortedItems.length > 0 && (
        <div>
          {sortedItems.map(item => (
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
