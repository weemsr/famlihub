"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, PackageOpen, ListPlus, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LIMITS, capLen } from '@/lib/limits';
import type { InventoryBody, InventoryItem, PantryLocation } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { useUndoDelete } from '@/components/UndoSnackbar';
import BulkAddSheet from './_components/BulkAddSheet';
import ScanSheet, { type ScanDraft } from './_components/ScanSheet';
import ItemRow from './_components/ItemRow';
import { LOCATIONS } from './_components/constants';

type LocationFilter = 'all' | PantryLocation | 'unsorted';

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<LocationFilter>('all');
  // Where single adds go, and the default for the bulk sheet. Sticky so
  // capturing a whole shelf doesn't mean re-picking the location every item.
  const [activeLocation, setActiveLocation] = useState<PantryLocation>('pantry');
  const [scanOpen, setScanOpen] = useState(false);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { offerUndo, snackbar } = useUndoDelete();

  // Fetch is separated from state application (applied in a .then callback)
  // for react-hooks/set-state-in-effect compliance; memoized so the mount
  // effect's dependency is stable.
  const loadItems = useCallback(() => {
    const fetchItems = async (): Promise<InventoryItem[] | null> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data } = await supabase.from('items').select('*').eq('type', 'inventory').order('created_at', { ascending: false });
      return (data as unknown as InventoryItem[]) ?? null;
    };
    fetchItems().then(d => { if (d) setItems(d); setLoaded(true); });
  }, []);

  useEffect(() => {
    loadItems();
    const channel = supabase.channel('realtime:inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: "type=eq.inventory" }, () => {
        loadItems();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadItems]);

  // Which vision providers are configured server-side. Empty => the scan
  // entry point stays hidden and manual capture is the only path.
  useEffect(() => {
    const run = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) return null;
      const res = await fetch('/api/pantry-scan', { headers: { Authorization: `Bearer ${jwt}` } });
      if (!res.ok) return null;
      const json = await res.json() as { providers?: { id: string; label: string }[] };
      return json.providers ?? [];
    };
    run().then(p => { if (p) setProviders(p); }).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const c: Record<LocationFilter, number> = { all: items.length, pantry: 0, fridge: 0, freezer: 0, unsorted: 0 };
    for (const it of items) {
      const loc = it.body?.location;
      if (loc === 'pantry' || loc === 'fridge' || loc === 'freezer') c[loc]++;
      else c.unsorted++;
    }
    return c;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'unsorted') return items.filter(i => !i.body?.location);
    return items.filter(i => i.body?.location === filter);
  }, [items, filter]);

  const addItem = async () => {
    if (!input.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const text = capLen(input.trim(), LIMITS.title);
    const prevInput = input;
    setInput('');
    inputRef.current?.focus(); // keep focus so several items can be typed rapid-fire

    const body: InventoryBody = { location: activeLocation };
    const { data, error } = await supabase.from('items')
      .insert({ type: 'inventory', title: text, body, user_id: userData.user.id })
      .select().single();
    if (error) {
      setInput(prevInput);
      return;
    }
    if (data) setItems(prev => [data as unknown as InventoryItem, ...prev]);
  };

  const saveBulk = async (names: string[], location: PantryLocation) => {
    if (names.length === 0) return;
    setBulkSaving(true);
    setBulkError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');

      const rows = names.map(name => ({
        type: 'inventory',
        title: capLen(name, LIMITS.title),
        body: { location } as InventoryBody,
        user_id: userData.user!.id,
      }));

      const { data, error } = await supabase.from('items').insert(rows).select();
      if (error) throw error;

      if (data) setItems(prev => [...(data as unknown as InventoryItem[]).reverse(), ...prev]);
      setActiveLocation(location);
      setBulkOpen(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to add items.');
    } finally {
      setBulkSaving(false);
    }
  };

  const importScanned = async (drafts: ScanDraft[], location: PantryLocation) => {
    if (drafts.length === 0) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not signed in');

    const rows = drafts.map(d => {
      const body: InventoryBody = { location };
      const qty = d.quantity.trim();
      if (qty) body.quantity = capLen(qty, LIMITS.title);
      if (d.level) body.level = d.level;
      return {
        type: 'inventory',
        title: capLen(d.name.trim(), LIMITS.title),
        body,
        user_id: userData.user!.id,
      };
    }).filter(r => r.title);

    const { data, error } = await supabase.from('items').insert(rows).select();
    if (error) throw error;
    if (data) setItems(prev => [...(data as unknown as InventoryItem[]).reverse(), ...prev]);
    setActiveLocation(location);
  };

  /** Patch one item's body optimistically, reverting the row on failure. */
  const patchBody = async (id: string, patch: Partial<InventoryBody>) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const nextBody: InventoryBody = { ...(item.body || {}), ...patch };
    // Drop keys explicitly cleared so the row doesn't keep empty strings.
    if (nextBody.quantity === '') delete nextBody.quantity;
    if (patch.level === undefined && 'level' in patch) delete nextBody.level;

    const prevItems = items;
    setItems(items.map(i => i.id === id ? { ...i, body: nextBody } : i));
    const { error } = await supabase.from('items').update({ body: nextBody }).eq('id', id);
    if (error) setItems(prevItems);
  };

  const deleteItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const prevItems = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) { setItems(prevItems); return; }
    offerUndo(item.title, item as unknown as Record<string, unknown>, () => {
      setItems(prev => (prev.some(i => i.id === item.id) ? prev : [item, ...prev]));
    });
  };

  const filterPills: { id: LocationFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...LOCATIONS.map(l => ({ id: l.id as LocationFilter, label: l.label })),
    ...(counts.unsorted > 0 ? [{ id: 'unsorted' as LocationFilter, label: 'Unsorted' }] : []),
  ];

  return (
    <div>
      <PageHeader
        icon={PackageOpen}
        color="#2D6A4F"
        title="Kitchen Inventory"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {providers.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => setScanOpen(true)}
                style={{ padding: '8px 14px', width: 'auto', borderRadius: 999, touchAction: 'manipulation' }}
              >
                <Camera size={16} /> Scan
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setBulkError(null); setBulkOpen(true); }}
              style={{ padding: '8px 14px', width: 'auto', borderRadius: 999, touchAction: 'manipulation' }}
            >
              <ListPlus size={16} /> Add many
            </button>
          </div>
        }
      />
      {snackbar}

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="form-label">Adding to</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {LOCATIONS.map(loc => {
            const active = activeLocation === loc.id;
            const Icon = loc.icon;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => setActiveLocation(loc.id)}
                aria-pressed={active}
                style={{
                  flex: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 8px', fontSize: '0.82rem', fontWeight: 700, borderRadius: 999,
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
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="input"
            placeholder="Add an item..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            maxLength={LIMITS.title}
          />
          <button className="btn" style={{ padding: '0 16px', width: 'auto' }} onClick={addItem} aria-label="Add item">
            <Plus size={24} />
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-hover)', padding: 4, borderRadius: 999, marginBottom: 16 }}>
          {filterPills.map(f => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                style={{
                  flex: 1, padding: '8px 6px', fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.2,
                  borderRadius: 999,
                  background: active ? 'var(--surface-color)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 4px var(--hairline-strong)' : 'none',
                  border: 'none', cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                {f.label} ({counts[f.id]})
              </button>
            );
          })}
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {!loaded && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
            <div className="skeleton" style={{ height: 14, width: '55%' }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
            <div className="skeleton" style={{ height: 14, width: '40%' }} />
          </div>
        )}
        {loaded && items.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
            Pantry is empty. {providers.length > 0
              ? <>Tap <strong>Scan</strong> to photograph a shelf and build your list automatically.</>
              : <>Tap <strong>Add many</strong> to capture a whole shelf at once.</>}
          </p>
        )}
        {loaded && items.length > 0 && visibleItems.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>
            Nothing here yet.
          </p>
        )}
        {visibleItems.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onQuantity={(id, quantity) => patchBody(id, { quantity })}
            onLevel={(id, level) => patchBody(id, { level })}
            onDelete={deleteItem}
          />
        ))}
      </div>

      {scanOpen && providers.length > 0 && (
        <ScanSheet
          providers={providers}
          defaultLocation={activeLocation}
          onImport={importScanned}
          onClose={() => setScanOpen(false)}
        />
      )}

      {bulkOpen && (
        <BulkAddSheet
          defaultLocation={activeLocation}
          saving={bulkSaving}
          error={bulkError}
          onSave={saveBulk}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
