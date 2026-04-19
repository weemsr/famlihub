"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CheckSquare, ShoppingCart, Utensils, PenTool, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';

export default function Home() {
  const [counts, setCounts] = useState({ todo: 0, grocery: 0, recipe: 0, note: 0, inventory: 0 });

  const loadCounts = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadCounts();

    // Keep counts live: any insert/update/delete on items (scoped to this
    // user by RLS) refreshes the dashboard.
    const channel = supabase
      .channel('realtime:home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => loadCounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCounts]);

  return (
    <div>
      <div style={{ marginLeft: -20, marginRight: -20, marginTop: -24, marginBottom: 24 }}>
        <Image
          src="/logo3.png"
          alt="FamLi Hub Logo"
          width={1600}
          height={900}
          priority
          sizes="(max-width: 800px) 100vw, 800px"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <ThemeToggle />
        <button
          onClick={() => {
            // AuthProvider's onAuthStateChange flips back to the login screen
            // when the session becomes null; no full-page reload needed.
            void supabase.auth.signOut();
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
        <Link href="/inventory" className="btn mt-4 btn-secondary" style={{ background: 'var(--surface-color)', color: 'var(--text-primary)', border: '2px solid var(--hairline-strong)' }}>
          <Package size={18} /> Open Pantry
        </Link>
      </div>

      <div className="flex gap-4 mb-4">
        <Link href="/todos" className="card w-full" style={{ marginBottom: 0, display: 'block', textDecoration: 'none' }}>
          <CheckSquare size={24} className="mb-4" style={{ color: "var(--accent-color)" }} />
          <h3 style={{ marginBottom: 4 }}>To-do</h3>
          <p className="text-sm">{counts.todo} pending</p>
        </Link>
        <Link href="/recipes" className="card w-full" style={{ marginBottom: 0, display: 'block', textDecoration: 'none' }}>
          <Utensils size={24} className="mb-4" style={{ color: "var(--accent-color)" }} />
          <h3 style={{ marginBottom: 4 }}>Recipes</h3>
          <p className="text-sm">{counts.recipe} saved</p>
        </Link>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Whiteboard Notes</h3>
        <p className="text-sm">{counts.note} specific sticky notes saved on the board.</p>
        <Link href="/notes" className="btn mt-4 btn-secondary" style={{ background: 'var(--surface-hover)', color: 'var(--text-primary)' }}>
          <PenTool size={18} /> Read Board
        </Link>
      </div>
    </div>
  );
}
