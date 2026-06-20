"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LIMITS, capLen } from '@/lib/limits';
import PageHeader from '@/components/PageHeader';
import Fab from '@/components/Fab';
import type { CreditCardBody, CreditCardItem } from '@/lib/types';
import ItemCard from './_components/ItemCard';
import ItemForm from './_components/ItemForm';
import {
  EMPTY_FORM,
  isoDay,
  statusFor,
  type FormState,
} from './_components/utils';

type CardFilter = 'all' | 'attention' | 'safe';
const FILTERS: { id: CardFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Cancel soon' },
  { id: 'safe', label: 'Safe' },
];

export default function CreditCardsPage() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = isoDay(today);

  const [items, setItems] = useState<CreditCardItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [filter, setFilter] = useState<CardFilter>('all');

  const loadItems = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setLoaded(true); return; }
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('type', 'credit-card')
      .order('created_at', { ascending: true });
    if (data) setItems(data as unknown as CreditCardItem[]);
    setLoaded(true);
  }, []);

  const loadRef = useRef(loadItems);
  useEffect(() => { loadRef.current = loadItems; }, [loadItems]);

  useEffect(() => {
    loadRef.current();
    const channel = supabase
      .channel('realtime:credit-cards')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: 'type=eq.credit-card' },
        () => loadRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Rank by urgency: closest cancel-by date first (most overdue / soonest).
  // Cards without a cancel-by date get +Infinity from statusFor and fall to
  // the bottom; ties break by title for stability.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const ra = statusFor(a.body || {}, todayIso);
      const rb = statusFor(b.body || {}, todayIso);
      if (ra.daysFromNow !== rb.daysFromNow) return ra.daysFromNow - rb.daysFromNow;
      return a.title.localeCompare(b.title);
    });
  }, [items, todayIso]);

  const counts = useMemo(() => {
    let attention = 0, safe = 0;
    for (const it of items) {
      const { status } = statusFor(it.body || {}, todayIso);
      if (status === 'past' || status === 'soon') attention++;
      else safe++;
    }
    return { all: items.length, attention, safe } as Record<CardFilter, number>;
  }, [items, todayIso]);

  const visibleItems = useMemo(() => {
    if (filter === 'all') return sortedItems;
    return sortedItems.filter(it => {
      const { status } = statusFor(it.body || {}, todayIso);
      const needsAttention = status === 'past' || status === 'soon';
      return filter === 'attention' ? needsAttention : !needsAttention;
    });
  }, [sortedItems, filter, todayIso]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (item: CreditCardItem) => {
    const body = item.body || {};
    setForm({
      id: item.id,
      title: item.title,
      bank: body.bank || '',
      last4: body.last4 || '',
      annualFee: typeof body.annualFee === 'number' ? String(body.annualFee) : '',
      cancelBy: body.cancelBy || '',
      notes: body.notes || '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const saveForm = async () => {
    const title = capLen(form.title.trim(), LIMITS.title);
    if (!title) { setFormError('Give this card a name.'); return; }

    const parsedFee = parseFloat(form.annualFee);
    const annualFee = Number.isFinite(parsedFee) && parsedFee >= 0 ? parsedFee : undefined;

    setFormSaving(true);
    setFormError(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');

      const last4 = form.last4.replace(/\D/g, '').slice(0, 4);

      const body: CreditCardBody = {};
      if (form.bank.trim()) body.bank = capLen(form.bank.trim(), LIMITS.title);
      if (last4) body.last4 = last4;
      if (typeof annualFee === 'number') body.annualFee = annualFee;
      if (form.cancelBy) body.cancelBy = form.cancelBy;
      if (form.notes.trim()) body.notes = capLen(form.notes.trim(), LIMITS.note);

      if (form.id) {
        const { error } = await supabase.from('items').update({ title, body }).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('items').insert({
          type: 'credit-card',
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

  const deleteItem = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this credit card?')) return;
    const prev = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setItems(prev);
  };

  // Quick "annual fees at risk" total — sums fees of cards whose cancel-by is
  // within 30 days (i.e. in the "Cancel soon" bucket). Helps motivate action.
  const feesAtRisk = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const { status } = statusFor(it.body || {}, todayIso);
      if ((status === 'past' || status === 'soon') && typeof it.body?.annualFee === 'number') {
        sum += it.body.annualFee;
      }
    }
    return sum;
  }, [items, todayIso]);

  return (
    <div style={{ paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 24px)' }}>
      <PageHeader icon={CreditCard} color="#1E3A8A" title="Credit Cards" />

      {!loaded && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      )}

      {items.length > 0 && (
        <>
          {feesAtRisk > 0 && (
            <div
              className="card"
              style={{
                padding: '12px 16px', marginBottom: 12,
                background: '#fef3c7', border: '1px solid #fde68a',
                color: '#78350f', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.88rem', fontWeight: 600,
              }}
            >
              <span>
                ${feesAtRisk.toLocaleString()} in annual fees coming due within 30 days.
              </span>
            </div>
          )}

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
                    fontSize: '0.82rem',
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
        </>
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
            />
          ))}
        </div>
      )}

      {loaded && items.length > 0 && visibleItems.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
          {filter === 'attention' ? 'Nothing to cancel soon. 🎉' : 'No cards are safely far out yet.'}
        </p>
      )}

      {loaded && items.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tap + to add your first credit card.</p>
      )}

      {!isFormOpen && <Fab onClick={openAdd} ariaLabel="Add credit card" />}

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
