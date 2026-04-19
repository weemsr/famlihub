"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { Plus, Trash2, Coffee, Sun, Moon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { safeImageUrl } from '@/lib/url';
import type { MealBody, RecipeBody } from '@/lib/types';

const MEAL_SLOTS = [
  { id: 'Breakfast', icon: Coffee, color: '#f59e0b' },
  { id: 'Lunch', icon: Sun, color: '#3b82f6' },
  { id: 'Dinner', icon: Moon, color: '#8b5cf6' }
];

interface MealItem {
  id: string;
  body: MealBody;
  created_at?: string;
}

interface RecipeItem {
  id: string;
  title: string;
  body: RecipeBody;
}

// Local-midnight timestamp for "today". Used to detect midnight rollover so the
// week view always shows the correct Monday–Sunday window.
const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export default function MealsPage() {
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const [todayKey, setTodayKey] = useState(getTodayKey);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDay, setActiveDay] = useState('');
  const [activeDayLabel, setActiveDayLabel] = useState('');
  const [activeMeal, setActiveMeal] = useState('');

  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [customName, setCustomName] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const [mealsRes, recipesRes] = await Promise.all([
      supabase.from('items').select('*').eq('type', 'meal'),
      supabase.from('items').select('*').eq('type', 'recipe').order('created_at', { ascending: false })
    ]);

    if (mealsRes.data) setMeals(mealsRes.data as unknown as MealItem[]);
    if (recipesRes.data) setRecipes(recipesRes.data as unknown as RecipeItem[]);
  }, []);

  // Ref so the realtime subscription never captures a stale callback.
  const loadDataRef = useRef(loadData);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

  useEffect(() => {
    loadDataRef.current();
    const channel = supabase.channel('realtime:meals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: "type=eq.meal" }, () => loadDataRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Close the modal on Escape.
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen]);

  // Keep the calendar in sync with the real calendar day. Covers:
  //  - user leaves the tab open past midnight (interval)
  //  - user backgrounds the tab and returns later (visibility change)
  //  - device wakes from sleep (focus event)
  useEffect(() => {
    const refresh = () => {
      const next = getTodayKey();
      setTodayKey(prev => (prev === next ? prev : next));
    };
    const interval = window.setInterval(refresh, 60 * 1000);
    window.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // O(1) lookup maps for meals and recipes (replaces nested .find() in render loop).
  // Each `${day}:${slot}` holds the list of meals scheduled for that slot, in
  // creation order, so users can plan 2+ recipes per meal.
  const mealsBySlot = useMemo(() => {
    const m = new Map<string, MealItem[]>();
    const sorted = [...meals].sort((a, b) => {
      const ta = a.created_at || '';
      const tb = b.created_at || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    for (const meal of sorted) {
      if (!meal.body) continue;
      const day = meal.body.day;
      const slot = meal.body.mealId;
      if (!day || !slot) continue;
      const key = `${day}:${slot}`;
      const list = m.get(key);
      if (list) list.push(meal);
      else m.set(key, [meal]);
    }
    return m;
  }, [meals]);

  const recipeById = useMemo(() => {
    const m = new Map<string, RecipeItem>();
    for (const r of recipes) m.set(r.id, r);
    return m;
  }, [recipes]);

  // Weeks always run Monday → Sunday in the user's local timezone.
  // Depending on `todayKey` (a yyyy-m-d string) makes the memo re-evaluate
  // automatically when midnight rolls over.
  const currentWeek = useMemo(() => {
    // Anchor to local midnight so date math never straddles DST edges weirdly.
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);

    const jsDay = anchor.getDay(); // Sun=0, Mon=1, … Sat=6
    // Distance back to Monday of the current week (Sunday is 6 days after Mon).
    const daysSinceMonday = jsDay === 0 ? 6 : jsDay - 1;

    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - daysSinceMonday + weekOffset * 7);

    return Array.from({ length: 7 }).map((_, i) => {
      const curr = new Date(monday);
      curr.setDate(monday.getDate() + i);

      const dayName = curr.toLocaleDateString('en-US', { weekday: 'long' });
      const monthStr = curr.toLocaleDateString('en-US', { month: 'short' });
      const dateNum = curr.getDate();

      const dbKey = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;

      return {
        label: `${dayName} - ${monthStr} ${dateNum}`,
        dbKey,
        dayName,
      };
    });
    // todayKey is intentionally in the deps so the view refreshes at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, todayKey]);

  const openAddModal = (dayKey: string, dayLabel: string, mealId: string) => {
    setActiveDay(dayKey);
    setActiveDayLabel(dayLabel);
    setActiveMeal(mealId);
    setSelectedRecipeId('');
    setCustomName('');
    setMealNote('');
    setIsModalOpen(true);
  };

  const saveMeal = async () => {
    if (!selectedRecipeId && !customName.trim()) return;
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setLoading(false); return; }

    const newBody = {
      day: activeDay,
      dayLabel: activeDayLabel,
      mealId: activeMeal,
      recipeId: selectedRecipeId,
      customName: customName.trim(),
      note: mealNote.trim()
    };

    // Multiple meals per slot are allowed — each save is additive, so users
    // can plan a 2nd/3rd recipe (and its own note) alongside existing ones.
    const { error } = await supabase.from('items').insert({
      type: 'meal',
      title: `${activeDay}-${activeMeal}`,
      body: newBody,
      user_id: userData.user.id
    });

    if (error) console.error('Failed to save meal:', error.message);

    setIsModalOpen(false);
    setLoading(false);
    loadData();
  };

  const removeMeal = async (id: string) => {
    const prevMeals = meals;
    setMeals(meals.filter(m => m.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) setMeals(prevMeals);
  };

  return (
    <div style={{ paddingBottom: 60 }}>
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ marginBottom: 0 }}>Meals 🍽️</h1>
        
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.05)', padding: 4, borderRadius: 999 }}>
          <button 
            className="btn" 
            style={{ 
              padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: 999,
              background: weekOffset === 0 ? 'var(--surface-color)' : 'transparent', 
              color: weekOffset === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', 
              boxShadow: weekOffset === 0 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' 
            }}
            onClick={() => setWeekOffset(0)}
          >
            This Week
          </button>
          <button 
            className="btn" 
            style={{ 
              padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: 999,
              background: weekOffset === 1 ? 'var(--surface-color)' : 'transparent', 
              color: weekOffset === 1 ? 'var(--text-primary)' : 'var(--text-secondary)', 
              boxShadow: weekOffset === 1 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' 
            }}
            onClick={() => setWeekOffset(1)}
          >
            Next Week
          </button>
        </div>
      </div>

      {currentWeek.map(dayObj => (
        <div key={dayObj.dbKey} className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ backgroundColor: 'var(--surface-hover)', padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '1.15rem', marginBottom: 0, color: 'var(--text-primary)' }}>
              {dayObj.label}
            </h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {MEAL_SLOTS.map((slot, i) => {
              const Icon = slot.icon;
              // Collect every meal for this slot. Support legacy entries keyed
              // by day name ('Monday') by merging both lookups.
              const scheduled = [
                ...(mealsBySlot.get(`${dayObj.dbKey}:${slot.id}`) || []),
                ...(mealsBySlot.get(`${dayObj.dayName}:${slot.id}`) || []),
              ];

              return (
                <div key={slot.id} style={{
                  display: 'flex', alignItems: 'flex-start', padding: '16px 20px',
                  borderBottom: i < MEAL_SLOTS.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none'
                }}>

                  {/* Slot Icon & Label */}
                  <div style={{ minWidth: 110, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: scheduled.length > 0 ? 8 : 4 }}>
                    <div style={{ padding: 8, backgroundColor: `${slot.color}15`, borderRadius: 12, color: slot.color }}>
                      <Icon size={16} />
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{slot.id}</span>
                  </div>

                  {/* Slot Content — stack every scheduled meal, then an Add Recipe button */}
                  <div style={{ flex: 1, paddingLeft: 8, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {scheduled.map(meal => {
                      const linkedRecipe = meal.body?.recipeId ? recipeById.get(meal.body.recipeId) ?? null : null;
                      const thumb = safeImageUrl(linkedRecipe?.body?.image);
                      return (
                        <div key={meal.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                            {thumb && (
                              <Image
                                src={thumb}
                                alt="meal"
                                width={40}
                                height={40}
                                style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                                unoptimized
                              />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {linkedRecipe ? linkedRecipe.title : meal.body.customName}
                              </span>
                              {meal.body.note && (
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                                  {meal.body.note}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove meal"
                            style={{ padding: 8, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation' }}
                            onClick={() => removeMeal(meal.id)}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8,
                        border: '2px dashed var(--surface-hover)', background: 'transparent',
                        color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
                        cursor: 'pointer', transition: 'border-color 0.2s ease', fontSize: '0.85rem',
                        touchAction: 'manipulation',
                      }}
                      onClick={() => openAddModal(dayObj.dbKey, dayObj.label, slot.id)}
                    >
                      <Plus size={16} /> {scheduled.length > 0 ? 'Add Another Recipe' : 'Add Recipe'}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Add Meal Modal Overlay */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--surface-color)', width: '100%', maxWidth: 600, 
            borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.1)', animation: 'slideUp 0.3s ease-out forwards'
          }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>{activeMeal}</h2>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{activeDayLabel}</div>
              </div>
              <button 
                style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Link a Recipe</label>
              <select 
                className="input" 
                value={selectedRecipeId} 
                onChange={e => { setSelectedRecipeId(e.target.value); setCustomName(''); }}
                style={{ appearance: 'none', height: 50, backgroundColor: '#f1f1f1', borderRadius: 16 }}
              >
                <option value="">-- Choose a Saved Recipe --</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>

            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 24 }}>
              — OR —
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Quick Add</label>
              <input 
                type="text" 
                className="input" 
                placeholder="e.g. In-N-Out Hot Dogs" 
                value={customName}
                onChange={e => { setCustomName(e.target.value); setSelectedRecipeId(''); }}
                style={{ borderRadius: 16 }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Optional Note</label>
              <textarea 
                className="input" 
                placeholder="e.g. Prep the chicken on Sunday" 
                value={mealNote}
                onChange={e => setMealNote(e.target.value)}
                style={{ borderRadius: 16, height: 80, resize: 'none' }}
              />
            </div>

            <button 
              className="btn" 
              onClick={saveMeal} 
              disabled={loading || (!selectedRecipeId && !customName.trim())}
              style={{ borderRadius: 16 }}
            >
              {loading ? 'Saving...' : 'Add to Planner'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
