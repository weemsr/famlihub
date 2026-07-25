"use client";
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, PackageOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LIMITS, capLen } from '@/lib/limits';
import PageHeader from '@/components/PageHeader';
import { useUndoDelete } from '@/components/UndoSnackbar';

interface InventoryItem {
  id: string;
  title: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
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

  const addItem = async () => {
    if (!input.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const text = capLen(input.trim(), LIMITS.title);
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

  return (
    <div>
      <PageHeader icon={PackageOpen} color="#2D6A4F" title="Kitchen Inventory" />
      {snackbar}
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
            maxLength={LIMITS.title}
          />
          <button className="btn" style={{ padding: '0 16px', width: 'auto' }} onClick={addItem}>
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!loaded && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
            <div className="skeleton" style={{ height: 14, width: '55%' }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
            <div className="skeleton" style={{ height: 14, width: '40%' }} />
          </div>
        )}
        {loaded && items.length === 0 && <p style={{color: 'var(--text-secondary)', textAlign: 'center'}}>Pantry is completely empty! Start adding some staples.</p>}
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
