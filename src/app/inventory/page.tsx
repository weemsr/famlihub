"use client";
import { useState, useEffect } from 'react';
import { Plus, Trash2, PackageOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/PageHeader';

interface InventoryItem {
  id: string;
  title: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [input, setInput] = useState('');

  const loadItems = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data } = await supabase.from('items').select('*').eq('type', 'inventory').order('created_at', { ascending: false });
    if (data) setItems(data as unknown as InventoryItem[]);
  };

  useEffect(() => {
    loadItems();
    const channel = supabase.channel('realtime:inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: "type=eq.inventory" }, () => {
        loadItems();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const addItem = async () => {
    if (!input.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const text = input.trim();
    const prevInput = input;
    setInput('');
    const { error } = await supabase.from('items').insert({ type: 'inventory', title: text, user_id: userData.user.id });
    if (error) {
      setInput(prevInput);
      return;
    }
    loadItems();
  };

  const deleteItem = async (id: string) => {
    const prevItems = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setItems(prevItems);
  };

  return (
    <div>
      <PageHeader icon={PackageOpen} color="#2D6A4F" title="Kitchen Inventory" />
      <p className="text-sm mb-4">Keep track of ingredients, pantry staples, and spices.</p>
      
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="flex gap-2">
          <input 
            type="text" 
            className="input" 
            placeholder="Add an ingredient..." 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
          <button className="btn" style={{ padding: '0 16px', width: 'auto' }} onClick={addItem}>
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <p style={{color: 'var(--text-secondary)', textAlign: 'center'}}>Pantry is completely empty! Start adding some staples.</p>}
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>
            <span style={{ fontWeight: 600 }}>{item.title}</span>
            <button 
              className="btn" 
              style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto' }}
              onClick={() => deleteItem(item.id)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
