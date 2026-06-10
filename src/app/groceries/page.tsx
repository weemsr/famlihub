"use client";
import { useState, useEffect } from 'react';
import { Plus, Trash2, ShoppingBag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { GroceryBody, GroceryStore } from '@/lib/types';
import { LIMITS, capLen } from '@/lib/limits';
import PageHeader from '@/components/PageHeader';

interface GroceryItem {
  id: string;
  title: string;
  is_completed: boolean;
  body: GroceryBody;
}

type StoreType = GroceryStore;

export default function GroceriesPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [regularInput, setRegularInput] = useState('');
  const [costcoInput, setCostcoInput] = useState('');
  const [asianInput, setAsianInput] = useState('');

  const loadItems = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase.from('items')
      .select('*')
      .eq('type', 'grocery')
      .order('created_at', { ascending: true });

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

  const addItem = async (store: StoreType) => {
    let text = '';
    if (store === 'regular') text = regularInput.trim();
    if (store === 'costco') text = costcoInput.trim();
    if (store === 'asian') text = asianInput.trim();

    if (!text) return;
    text = capLen(text, LIMITS.title);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const prevRegular = regularInput, prevCostco = costcoInput, prevAsian = asianInput;
    if (store === 'regular') setRegularInput('');
    if (store === 'costco') setCostcoInput('');
    if (store === 'asian') setAsianInput('');

    const { error } = await supabase.from('items').insert({
      type: 'grocery',
      title: text,
      body: { store },
      user_id: userData.user.id
    });

    if (error) {
      if (store === 'regular') setRegularInput(prevRegular);
      if (store === 'costco') setCostcoInput(prevCostco);
      if (store === 'asian') setAsianInput(prevAsian);
    }
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

  const regularItems = items.filter(i => i.body?.store === 'regular' || !i.body?.store);
  const costcoItems = items.filter(i => i.body?.store === 'costco');
  const asianItems = items.filter(i => i.body?.store === 'asian');

  const renderSection = (title: string, store: StoreType, list: GroceryItem[], input: string, setInput: (v: string) => void) => (
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
        <button className="btn" style={{ padding: '0 16px', width: 'auto' }} onClick={() => addItem(store)}>
          <Plus size={24} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No items yet.</span>}
        {list.map(item => (
          <div key={item.id} className="checkbox-row flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input 
                type="checkbox" 
                className="checkbox-input" 
                checked={item.is_completed} 
                onChange={() => toggleItem(item.id, item.is_completed)}
              />
              <span className={`checkbox-label ${item.is_completed ? 'completed' : ''}`}>
                {item.title}
              </span>
            </div>
            <button 
              className="btn" 
              style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto' }}
              onClick={() => deleteItem(item.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
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
