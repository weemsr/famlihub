"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Fab from '@/components/Fab';
import PageHeader from '@/components/PageHeader';
import { MEAL_SLOTS, type MealItem, type RecipeItem } from './_components/constants';
import WeekNavigator from './_components/WeekNavigator';
import DayCard from './_components/DayCard';
import MealModal from './_components/MealModal';

// Local-midnight timestamp for "today". Used to detect midnight rollover so the
// week view always shows the correct Monday–Sunday window.
const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function dayLabelFor(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  const dayName = dt.toLocaleDateString('en-US', { weekday: 'long' });
  const monthStr = dt.toLocaleDateString('en-US', { month: 'short' });
  return `${dayName} - ${monthStr} ${dt.getDate()}`;
}

export default function MealsPage() {
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [todayKey, setTodayKey] = useState(getTodayKey);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDay, setActiveDay] = useState('');
  const [activeDayLabel, setActiveDayLabel] = useState('');
  const [activeMeal, setActiveMeal] = useState('');
  const [isFabAdd, setIsFabAdd] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [customName, setCustomName] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const [mealsRes, recipesRes] = await Promise.all([
      supabase.from('items').select('*').eq('type', 'meal'),
      supabase.from('items').select('*').eq('type', 'recipe').order('created_at', { ascending: false }),
    ]);

    if (mealsRes.data) setMeals(mealsRes.data as unknown as MealItem[]);
    if (recipesRes.data) setRecipes(recipesRes.data as unknown as RecipeItem[]);
  }, []);

  const loadDataRef = useRef(loadData);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

  useEffect(() => {
    loadDataRef.current();
    const channel = supabase.channel('realtime:meals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: 'type=eq.meal' }, () => loadDataRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
      if (list) list.push(meal); else m.set(key, [meal]);
    }
    return m;
  }, [meals]);

  const recipeById = useMemo(() => {
    const m = new Map<string, RecipeItem>();
    for (const r of recipes) m.set(r.id, r);
    return m;
  }, [recipes]);

  const currentWeek = useMemo(() => {
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    const todayIso = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-${String(anchor.getDate()).padStart(2, '0')}`;

    const jsDay = anchor.getDay();
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
        isToday: dbKey === todayIso,
      };
    });
    // todayKey keeps the memo fresh across midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, todayKey]);

  const weekRangeLabel = useMemo(() => {
    if (currentWeek.length < 7) return '';
    const first = currentWeek[0];
    const last = currentWeek[6];
    const [fy, fm, fd] = first.dbKey.split('-').map(Number);
    const [ly, lm, ld] = last.dbKey.split('-').map(Number);
    const firstMonth = new Date(fy, fm - 1, fd).toLocaleDateString('en-US', { month: 'short' });
    const lastMonth = new Date(ly, lm - 1, ld).toLocaleDateString('en-US', { month: 'short' });
    const sameMonth = firstMonth === lastMonth && fy === ly;
    return sameMonth ? `${firstMonth} ${fd} – ${ld}` : `${firstMonth} ${fd} – ${lastMonth} ${ld}`;
  }, [currentWeek]);

  const weekQualifier =
    weekOffset === 0 ? 'This Week' :
    weekOffset === 1 ? 'Next Week' :
    weekOffset === -1 ? 'Last Week' :
    null;

  const openAddModal = (dayKey: string, dayLabel: string, mealId: string) => {
    setActiveDay(dayKey);
    setActiveDayLabel(dayLabel);
    setActiveMeal(mealId);
    setSelectedRecipeId('');
    setCustomName('');
    setMealNote('');
    setIsFabAdd(false);
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
      note: mealNote.trim(),
    };

    const { error } = await supabase.from('items').insert({
      type: 'meal',
      title: `${activeDay}-${activeMeal}`,
      body: newBody,
      user_id: userData.user.id,
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

  const openAddForToday = () => {
    const d = new Date();
    const dbKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = dayLabelFor(dbKey);

    const todaysSlotIds = MEAL_SLOTS.map(s => s.id);
    const booked = new Set(
      meals.filter(m => m.body?.day === dbKey).map(m => m.body.mealId)
    );
    const firstEmpty = todaysSlotIds.find(id => !booked.has(id)) || todaysSlotIds[0];

    setWeekOffset(0);
    openAddModal(dbKey, dayLabel, firstEmpty);
    setIsFabAdd(true);
  };

  return (
    <div style={{ paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 24px)' }}>
      <PageHeader
        icon={UtensilsCrossed}
        color="#CC3333"
        title="Meals"
        right={weekOffset !== 0 ? (
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="btn"
            style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: 999, background: 'var(--surface-hover)', color: 'var(--text-primary)', touchAction: 'manipulation' }}
          >
            Today
          </button>
        ) : undefined}
      />

      <WeekNavigator
        weekQualifier={weekQualifier}
        weekRangeLabel={weekRangeLabel}
        onPrev={() => setWeekOffset(w => w - 1)}
        onNext={() => setWeekOffset(w => w + 1)}
      />

      {currentWeek.map(dayObj => (
        <DayCard
          key={dayObj.dbKey}
          day={dayObj}
          mealsBySlot={mealsBySlot}
          recipeById={recipeById}
          onAdd={openAddModal}
          onRemove={removeMeal}
        />
      ))}

      {isModalOpen && (
        <MealModal
          activeMeal={activeMeal}
          activeDay={activeDay}
          activeDayLabel={activeDayLabel}
          isFabAdd={isFabAdd}
          selectedRecipeId={selectedRecipeId}
          customName={customName}
          mealNote={mealNote}
          recipes={recipes}
          loading={loading}
          onClose={() => setIsModalOpen(false)}
          onChangeDay={next => {
            setActiveDay(next);
            setActiveDayLabel(dayLabelFor(next));
          }}
          onSelectRecipe={id => { setSelectedRecipeId(id); setCustomName(''); }}
          onChangeCustomName={v => { setCustomName(v); setSelectedRecipeId(''); }}
          onChangeNote={setMealNote}
          onSave={saveMeal}
        />
      )}

      {!isModalOpen && (
        <Fab
          ariaLabel="Add meal for today"
          onClick={openAddForToday}
        />
      )}
    </div>
  );
}
