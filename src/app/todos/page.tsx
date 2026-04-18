"use client";
import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, FolderPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { TodoBody } from '@/lib/types';

interface TodoItem {
  id: string;
  title: string;
  is_completed: boolean;
  user_id?: string;
  body?: TodoBody;
}

const CATEGORIES = [
  "😈 Do it, or else",
  "😘 Pretty please",
  "🥺 If you love me"
];

export default function TodosPage() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [moverOpenId, setMoverOpenId] = useState<string | null>(null);

  // Close the category mover popover when clicking anywhere else.
  useEffect(() => {
    if (!moverOpenId) return;
    const onClick = () => setMoverOpenId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoverOpenId(null);
    };
    // Defer so the initial opening click doesn't immediately close it.
    const t = setTimeout(() => {
      window.addEventListener('click', onClick);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [moverOpenId]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleMoveItem = async (id: string, targetCategory: string) => {
    setMoverOpenId(null);
    const item = items.find(i => i.id === id);
    const prevItems = items;
    const updatedBody: TodoBody = { ...(item?.body || {}), category: targetCategory };
    setItems(items.map(i => i.id === id ? { ...i, body: updatedBody } : i));
    const { error } = await supabase.from('items').update({ body: updatedBody }).eq('id', id);
    if (error) setItems(prevItems);
  };

  const loadItems = async () => {
    const { data } = await supabase.from('items').select('*').eq('type', 'todo').order('created_at', { ascending: false });
    if (data) setItems(data);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const addItem = async () => {
    if (!input.trim()) return;
    const title = input.trim();
    const cat = activeCategory;
    const prevInput = input;

    // Optimistic UI
    const tempId = Math.random().toString();
    setItems(prev => [{ id: tempId, title, is_completed: false, body: { category: cat } }, ...prev]);
    setInput('');

    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('items').insert({
      title,
      type: 'todo',
      body: { category: cat },
      user_id: userData?.user?.id
    });

    if (error) {
      setItems(prev => prev.filter(i => i.id !== tempId));
      setInput(prevInput);
      return;
    }
    loadItems();
  };

  const toggleItem = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const item = items.find(i => i.id === id);
    const prevItems = items;
    const updatedBody = { ...item?.body, completedAt: newStatus ? new Date().toISOString() : null };
    setItems(items.map(i => i.id === id ? { ...i, is_completed: newStatus, body: updatedBody } : i));
    const { error } = await supabase.from('items').update({ is_completed: newStatus, body: updatedBody }).eq('id', id);
    if (error) setItems(prevItems);
  };

  const deleteItem = async (id: string) => {
    const prevItems = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setItems(prevItems);
  };

  const startEdit = (item: TodoItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    setItems(items.map(i => i.id === id ? { ...i, title: editTitle } : i));
    setEditingId(null);
    await supabase.from('items').update({ title: editTitle }).eq('id', id);
  };

  const activeItems = items.filter(i => !i.is_completed);
  const completedItems = items.filter(i => i.is_completed);

  return (
    <div style={{ paddingBottom: 60 }}>
      <h1>To-do ✓</h1>
      
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <select 
            className="input" 
            value={activeCategory} 
            onChange={e => setActiveCategory(e.target.value)}
            style={{ width: '100%', backgroundColor: '#f9f9f9', borderRadius: 16, border: '1px solid var(--surface-hover)' }}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-2">
            <input 
              type="text" 
              className="input" 
              placeholder="Add a task..." 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              style={{ borderRadius: 16 }}
            />
            <button className="btn" style={{ padding: '0 16px', width: 'auto', borderRadius: 16 }} onClick={addItem}>
              <Plus size={24} />
            </button>
          </div>
        </div>
      </div>

      {CATEGORIES.map(categoryName => {
        const catItems = activeItems.filter(i => (i.body?.category || CATEGORIES[0]) === categoryName);
        const isCollapsed = !!collapsedCategories[categoryName];
        
        return (
          <div 
             key={categoryName} 
             className="card" 
             style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}
          >
            <div 
               style={{ backgroundColor: 'var(--surface-hover)', padding: '12px 20px', borderBottom: isCollapsed ? 'none' : '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
               onClick={() => toggleCategory(categoryName)}
            >
              <h2 style={{ fontSize: '1.1rem', marginBottom: 0, color: 'var(--text-primary)' }}>{categoryName} {catItems.length > 0 ? `(${catItems.length})` : ''}</h2>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>{isCollapsed ? '▼ Show' : '▲ Hide'}</span>
            </div>
            
            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 20px', gap: 0, minHeight: 60 }}>
                {catItems.length === 0 && <p style={{color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '8px 0', margin: 0, fontStyle: 'italic'}}>Add a new task above...</p>}
                
                {catItems.map((item, idx) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div 
                      key={item.id} 
                      className="checkbox-row flex items-center justify-between" 
                      style={{ padding: '12px 0', borderBottom: idx < catItems.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, paddingRight: 16 }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                           <button
                             className="btn"
                             type="button"
                             aria-label={`Move "${item.title}" to another category`}
                             aria-haspopup="menu"
                             aria-expanded={moverOpenId === item.id}
                             style={{ padding: '4px', background: 'transparent', color: 'var(--text-secondary)', width: 'auto' }}
                             onClick={(e) => {
                               e.stopPropagation();
                               setMoverOpenId(moverOpenId === item.id ? null : item.id);
                             }}
                           >
                             <FolderPlus size={16} />
                           </button>
                           {moverOpenId === item.id && (
                             <ul
                               role="menu"
                               onClick={e => e.stopPropagation()}
                               style={{
                                 position: 'absolute',
                                 top: 'calc(100% + 6px)',
                                 left: 0,
                                 zIndex: 10,
                                 background: 'var(--surface-color)',
                                 border: '1px solid rgba(0,0,0,0.08)',
                                 borderRadius: 12,
                                 boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                                 listStyle: 'none',
                                 padding: 4,
                                 margin: 0,
                                 minWidth: 200,
                               }}
                             >
                               {CATEGORIES.map(c => {
                                 const current = (item.body?.category || CATEGORIES[0]) === c;
                                 return (
                                   <li key={c} role="none">
                                     <button
                                       type="button"
                                       role="menuitem"
                                       onClick={() => handleMoveItem(item.id, c)}
                                       disabled={current}
                                       style={{
                                         width: '100%',
                                         textAlign: 'left',
                                         padding: '8px 12px',
                                         borderRadius: 8,
                                         background: current ? 'var(--surface-hover)' : 'transparent',
                                         color: current ? 'var(--text-secondary)' : 'var(--text-primary)',
                                         border: 'none',
                                         cursor: current ? 'default' : 'pointer',
                                         fontSize: '0.9rem',
                                         fontWeight: 500,
                                       }}
                                     >
                                       {c}{current ? ' ✓' : ''}
                                     </button>
                                   </li>
                                 );
                               })}
                             </ul>
                           )}
                        </div>
                      
                      <input 
                        type="checkbox" 
                        className="checkbox-input" 
                        checked={item.is_completed} 
                        onChange={() => toggleItem(item.id, item.is_completed)}
                      />
                      {isEditing ? (
                        <input 
                          type="text" 
                          className="input" 
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                          autoFocus
                          style={{ padding: '8px 16px' }}
                        />
                      ) : (
                        <span className="checkbox-label" style={{ transition: 'color 0.2s ease', fontWeight: 500 }}>
                          {item.title}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 4 }}>
                      {isEditing ? (
                        <button className="btn" style={{ padding: '6px 12px', width: 'auto', background: 'var(--success-color)' }} onClick={() => saveEdit(item.id)}>Save</button>
                      ) : (
                        <>
                          <button 
                            className="btn" 
                            style={{ padding: '4px 8px', background: 'transparent', color: 'var(--text-secondary)', width: 'auto' }}
                            onClick={() => startEdit(item)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className="btn" 
                            style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto' }}
                            onClick={() => deleteItem(item.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        );
      })}

      {completedItems.length > 0 && (
        <div className="card" style={{ marginBottom: 24, padding: '20px', background: 'var(--surface-color)', opacity: 0.8 }}>
          <div 
             style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
             onClick={() => setShowCompleted(!showCompleted)}
          >
            <h2 style={{ fontSize: '1.2rem', marginBottom: 0, color: 'var(--text-secondary)' }}>Completed ✓ ({completedItems.length})</h2>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>{showCompleted ? '▲ Hide' : '▼ Show'}</span>
          </div>
          
          {showCompleted && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 16 }}>
              {completedItems.map((item, idx) => (
                <div 
                  key={item.id} 
                  className="checkbox-row flex items-center justify-between" 
                  style={{ padding: '10px 0', borderBottom: idx < completedItems.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, paddingRight: 16 }}>
                    <input 
                      type="checkbox" 
                      className="checkbox-input" 
                      checked={true} 
                      onChange={() => toggleItem(item.id, true)}
                    />
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="checkbox-label completed" style={{ textDecoration: 'line-through', color: 'var(--text-secondary)' }}>
                        {item.title}
                      </span>
                      {item.body?.completedAt && (
                        <span style={{ fontSize: '0.75rem', color: '#a0a0a0', whiteSpace: 'nowrap', marginLeft: 12 }}>
                          {new Date(item.body.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
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
          )}
        </div>
      )}

    </div>
  );
}
