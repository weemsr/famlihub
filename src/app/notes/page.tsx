"use client";
import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface NoteItem {
  id: string;
  title: string;
  body: string;
}

export default function NotesPage() {
  const [items, setItems] = useState<NoteItem[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  const loadItems = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data } = await supabase.from('items').select('*').eq('type', 'note').order('created_at', { ascending: false });
    if (data) setItems(data as unknown as NoteItem[]);
  };

  useEffect(() => {
    loadItems();
    const channel = supabase.channel('realtime:notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: "type=eq.note" }, () => {
        loadItems();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const addNote = async () => {
    if (!title.trim() && !body.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    if (typeof window !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const t = title.trim();
    const b = body.trim();

    const { data, error } = await supabase.from('items').insert({ type: 'note', title: t || 'Untitled Note', body: b, user_id: userData.user.id }).select().single();
    if (error) return; // Keep draft in form on failure

    setTitle('');
    setBody('');
    setIsCreating(false);
    if (data) {
      setItems(prev => [data as unknown as NoteItem, ...prev]);
      setExpandedId(data.id);
    }
  };

  const deleteNote = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const prevItems = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setItems(prevItems);
  };

  const startEdit = (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditBody(note.body);
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId) return;

    const prevItems = items;
    setItems(items.map(i => i.id === editingId ? { ...i, title: editTitle, body: editBody } : i));
    setEditingId(null);
    const { error } = await supabase.from('items').update({ title: editTitle, body: editBody }).eq('id', editingId);
    if (error) setItems(prevItems);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 style={{ marginBottom: 0 }}>Whiteboard 📝</h1>
        <button className="btn" style={{ padding: '8px 16px', width: 'auto' }} onClick={() => setIsCreating(!isCreating)}>
          <Plus size={18} style={{ marginRight: 4 }} /> {isCreating ? 'Cancel' : 'New'}
        </button>
      </div>
      
      {isCreating && (
        <div className="card" style={{ marginBottom: 24, border: '2px solid var(--accent-color)', padding: 20 }}>
          <input
            type="text"
            className="input mb-4"
            placeholder="Note Title..."
            style={{ fontWeight: 'bold' }}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <textarea
            className="input mb-4"
            placeholder="Write your note here..."
            style={{ height: 250, resize: 'none' }}
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <button type="button" className="btn" style={{ touchAction: 'manipulation' }} onClick={addNote}>Save Note</button>
        </div>
      )}

      {items.length === 0 && !isCreating && <p style={{textAlign: 'center', color: 'var(--text-secondary)', marginTop: 40}}>Board is empty!</p>}

      {items.map(note => {
        const isExpanded = expandedId === note.id;
        const isEditing = editingId === note.id;
        const bodyText = typeof note.body === 'string' ? note.body : '';

        if (isEditing) {
          return (
            <div key={note.id} className="card" style={{ marginBottom: 16, border: '2px solid var(--accent-color)', padding: 20 }}>
              <input
                type="text"
                className="input mb-4"
                placeholder="Note Title..."
                style={{ fontWeight: 'bold' }}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
              />
              <textarea
                className="input mb-4"
                placeholder="Write your note here..."
                style={{ height: 250, resize: 'none' }}
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" className="btn" style={{ background: 'var(--success-color)', touchAction: 'manipulation' }} onClick={saveEdit}>Save Changes</button>
                <button type="button" className="btn btn-secondary" style={{ touchAction: 'manipulation' }} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          );
        }

        // Card is NOT clickable as a whole — only the header row is — so the
        // Edit/Delete buttons are never competing with a parent click handler
        // (which on iOS often makes nested taps feel unresponsive).
        return (
          <div
            key={note.id}
            className="card"
            style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}
          >
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : note.id)}
                aria-expanded={isExpanded}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'inherit',
                  font: 'inherit',
                  touchAction: 'manipulation',
                }}
              >
                <h3 style={{ marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</h3>
                {!isExpanded && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bodyText.replace(/\n/g, ' ')}
                  </p>
                )}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {isExpanded && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      aria-label="Edit note"
                      style={{ padding: '4px 8px', background: 'transparent', color: 'var(--text-secondary)', width: 'auto', touchAction: 'manipulation' }}
                      onClick={(e) => startEdit(note, e)}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label="Delete note"
                      style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto', touchAction: 'manipulation' }}
                      onClick={(e) => deleteNote(note.id, e)}
                    >
                      <Trash2 size={20} />
                    </button>
                  </>
                )}
                {isExpanded ? <ChevronUp size={20} className="text-secondary" /> : <ChevronDown size={20} className="text-secondary" />}
              </div>
            </div>

            {isExpanded && (
              <div style={{ padding: '0 20px 24px 20px', borderTop: '1px solid rgba(0,0,0,0.03)', paddingTop: 16 }}>
                <p className="text-sm" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {bodyText}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
