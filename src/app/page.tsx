"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckSquare, ShoppingCart, Utensils, PenTool, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [counts, setCounts] = useState({ todo: 0, grocery: 0, recipe: 0, note: 0, inventory: 0 });

  useEffect(() => {
    async function loadCounts() {
      // Ensure user is authenticated before fetching 
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data } = await supabase.from('items').select('type, is_completed');
      
      if (data) {
        const c = { todo: 0, grocery: 0, recipe: 0, note: 0, inventory: 0 };
        data.forEach(item => {
          if (item.type === 'todo' && !item.is_completed) c.todo++;
          if (item.type === 'grocery' && !item.is_completed) c.grocery++;
          if (item.type === 'recipe') c.recipe++;
          if (item.type === 'note') c.note++;
          if (item.type === 'inventory') c.inventory++;
        });
        setCounts(c);
      }
    }
    
    loadCounts();
  }, []);

  return (
    <div>
      <div style={{ marginLeft: -20, marginRight: -20, marginTop: -24, marginBottom: 24 }}>
        <img 
          src="/logo3.png" 
          alt="FamLi Hub Logo" 
          style={{ width: '100%', display: 'block', height: 'auto' }} 
        />
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button 
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.reload();
          }}
          style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.2)', padding: '6px 12px', borderRadius: 8, color: 'var(--danger-color)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </div>
      
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Recent Groceries</h3>
        <p className="text-sm">You have {counts.grocery} items left to buy.</p>
        <Link href="/groceries" className="btn mt-4">
          <ShoppingCart size={18} /> Open Groceries
        </Link>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Pantry Inventory</h3>
        <p className="text-sm">{counts.inventory} ingredients logged.</p>
        <Link href="/inventory" className="btn mt-4 btn-secondary" style={{ background: 'var(--surface-color)', color: 'var(--text-primary)', border: '2px solid rgba(0,0,0,0.1)' }}>
          <Package size={18} /> Open Pantry
        </Link>
      </div>

      <div className="flex gap-4 mb-4">
        <Link href="/todos" className="card w-full" style={{ marginBottom: 0, display: 'block', textDecoration: 'none' }}>
          <CheckSquare size={24} className="mb-4" style={{ color: "var(--accent-color)"}} />
          <h3 style={{ marginBottom: 4 }}>To-do</h3>
          <p className="text-sm">{counts.todo} pending</p>
        </Link>
        <Link href="/recipes" className="card w-full" style={{ marginBottom: 0, display: 'block', textDecoration: 'none' }}>
          <Utensils size={24} className="mb-4" style={{ color: "var(--accent-color)"}} />
          <h3 style={{ marginBottom: 4 }}>Recipes</h3>
          <p className="text-sm">{counts.recipe} saved</p>
        </Link>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Whiteboard Notes</h3>
        <p className="text-sm">{counts.note} specific sticky notes saved on the board.</p>
        <Link href="/notes" className="btn mt-4 btn-secondary" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)' }}>
          <PenTool size={18} /> Read Board
        </Link>
      </div>
    </div>
  );
}
