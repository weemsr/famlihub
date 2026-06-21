"use client";
import { useState, useEffect, useMemo } from 'react';
import { Plus, ShoppingBag } from 'lucide-react';
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { supabase } from '@/lib/supabase';
import type { GroceryBody, GroceryStore } from '@/lib/types';
import { LIMITS, capLen } from '@/lib/limits';
import PageHeader from '@/components/PageHeader';
import SortableGroceryRow from './_components/SortableGroceryRow';

interface GroceryItem {
  id: string;
  title: string;
  is_completed: boolean;
  body: GroceryBody;
  created_at?: string;
}

/**
 * Sort rule: one continuous number line. An item's effective sort key is its
 * `body.order` when set, otherwise its `created_at` epoch ms. Both
 * Groceries-tab adds and Recipe-page "+ Add to grocery" stamp `order = Date.now()`
 * on insert, so new items always land below everything else. Legacy rows
 * without an `order` keep their creation-time position via the same scale.
 */
function effectiveOrder(item: GroceryItem): number {
  const o = item.body?.order;
  if (typeof o === 'number') return o;
  return item.created_at ? new Date(item.created_at).getTime() : 0;
}

function compareGrocery(a: GroceryItem, b: GroceryItem): number {
  return effectiveOrder(a) - effectiveOrder(b);
}

/**
 * Compute the new `order` for an item dropped between two neighbors. Uses the
 * midpoint of the neighbors' effective orders so only the moved row needs a
 * DB write. Drops at the edges anchor relative to the neighbor we have.
 */
function orderForDrop(sortedList: GroceryItem[], destIndex: number): number {
  const before = sortedList[destIndex - 1];
  const after = sortedList[destIndex + 1];
  if (before && after) return (effectiveOrder(before) + effectiveOrder(after)) / 2;
  if (before) return effectiveOrder(before) + 1;
  if (after) return effectiveOrder(after) - 1;
  return Date.now();
}

export default function GroceriesPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [regularInput, setRegularInput] = useState('');
  const [costcoInput, setCostcoInput] = useState('');
  const [asianInput, setAsianInput] = useState('');

  // Sensors tuned for mobile + desktop. The 6px activation distance on the
  // pointer sensor prevents accidental drags when the user is really just
  // tapping the handle; TouchSensor uses a 200ms press to avoid hijacking
  // page scrolling.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadItems = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase.from('items')
      .select('*')
      .eq('type', 'grocery');

    if (data) setItems(data as unknown as GroceryItem[]);
  };

  useEffect(() => {
    loadItems();
    const channel = supabase.channel('realtime:groceries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: "type=eq.grocery" }, () => {
        loadItems();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Pre-sorted, per-store lists. Memoized so drag operations don't re-sort
  // every keystroke in the inputs.
  const { regularItems, costcoItems, asianItems } = useMemo(() => {
    const sorted = [...items].sort(compareGrocery);
    return {
      regularItems: sorted.filter(i => i.body?.store === 'regular' || !i.body?.store),
      costcoItems:  sorted.filter(i => i.body?.store === 'costco'),
      asianItems:   sorted.filter(i => i.body?.store === 'asian'),
    };
  }, [items]);

  const addItem = async (store: GroceryStore) => {
    let text = '';
    if (store === 'regular') text = regularInput.trim();
    if (store === 'costco') text = costcoInput.trim();
    if (store === 'asian') text = asianInput.trim();
    if (!text) return;
    text = capLen(text, LIMITS.title);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    // Date.now() is on the same scale as `effectiveOrder`'s created_at
    // fallback, so a new item always sorts to the true bottom of its list —
    // including past legacy items that never got an `order` field set.
    const body: GroceryBody = { store, order: Date.now() };

    const prevRegular = regularInput, prevCostco = costcoInput, prevAsian = asianInput;
    if (store === 'regular') setRegularInput('');
    if (store === 'costco') setCostcoInput('');
    if (store === 'asian') setAsianInput('');

    const { data, error } = await supabase.from('items').insert({
      type: 'grocery',
      title: text,
      body,
      user_id: userData.user.id,
    }).select().single();

    if (error) {
      if (store === 'regular') setRegularInput(prevRegular);
      if (store === 'costco') setCostcoInput(prevCostco);
      if (store === 'asian') setAsianInput(prevAsian);
      return;
    }

    // Show it immediately instead of waiting for the realtime echo.
    if (data) setItems(prev => [...prev, data as unknown as GroceryItem]);
  };

  const toggleItem = async (id: string, currentStatus: boolean) => {
    const prevItems = items;
    setItems(items.map(i => i.id === id ? { ...i, is_completed: !currentStatus } : i));
    const { error } = await supabase.from('items').update({ is_completed: !currentStatus }).eq('id', id);
    if (error) setItems(prevItems);
  };

  const deleteItem = async (id: string) => {
    const prevItems = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setItems(prevItems);
  };

  /**
   * Drag end handler factory: closes over the store-specific list. Optimistic
   * UI moves the row immediately; only the moved row's `order` is written to
   * the DB. On error we revert.
   */
  const handleDragEnd = (list: GroceryItem[]) => async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = list.findIndex(i => i.id === active.id);
    const toIndex = list.findIndex(i => i.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = arrayMove(list, fromIndex, toIndex);
    const newOrder = orderForDrop(reordered, toIndex);
    const movedItem = list[fromIndex];
    const updatedBody: GroceryBody = { ...(movedItem.body || {}), order: newOrder };

    const prevItems = items;
    setItems(items.map(i => i.id === movedItem.id ? { ...i, body: updatedBody } : i));

    const { error } = await supabase.from('items').update({ body: updatedBody }).eq('id', movedItem.id);
    if (error) setItems(prevItems);
  };

  const renderSection = (title: string, store: GroceryStore, list: GroceryItem[], input: string, setInput: (v: string) => void) => (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3 className="mb-4">{title}</h3>

      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        <input
          type="text"
          className="input"
          placeholder={`Add to ${title}...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem(store)}
          maxLength={LIMITS.title}
        />
        <button className="btn" style={{ padding: '0 16px', width: 'auto' }} onClick={() => addItem(store)} aria-label={`Add to ${title}`}>
          <Plus size={24} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {list.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No items yet.</span>}
        {list.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(list)}>
            <SortableContext items={list.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {list.map(item => (
                <SortableGroceryRow
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  isCompleted={item.is_completed}
                  onToggle={() => toggleItem(item.id, item.is_completed)}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader icon={ShoppingBag} color="#E05B1C" title="Groceries" />
      {renderSection('Regular Groceries', 'regular', regularItems, regularInput, setRegularInput)}
      {renderSection('Costco Run', 'costco', costcoItems, costcoInput, setCostcoInput)}
      {renderSection('Asian Market', 'asian', asianItems, asianInput, setAsianInput)}
    </div>
  );
}
