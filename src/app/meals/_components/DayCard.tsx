import Image from 'next/image';
import { Plus, Trash2 } from 'lucide-react';
import { safeImageUrl } from '@/lib/url';
import { MEAL_SLOTS, type MealItem, type RecipeItem, type WeekDay } from './constants';

export default function DayCard({
  day,
  mealsBySlot,
  recipeById,
  onAdd,
  onRemove,
}: {
  day: WeekDay;
  mealsBySlot: Map<string, MealItem[]>;
  recipeById: Map<string, RecipeItem>;
  onAdd: (dayKey: string, dayLabel: string, slotId: string) => void;
  onRemove: (mealId: string) => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 0,
        marginBottom: 24,
        overflow: 'hidden',
        outline: day.isToday ? '2px solid var(--accent-color)' : 'none',
      }}
    >
      <div style={{ backgroundColor: 'var(--surface-hover)', padding: '12px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: 0, color: 'var(--text-primary)' }}>
          {day.label}
        </h2>
        {day.isToday && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'white', background: 'var(--accent-color)', padding: '3px 10px', borderRadius: 999 }}>
            Today
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {MEAL_SLOTS.map((slot, i) => {
          const Icon = slot.icon;
          // Collect every meal for this slot. Support legacy entries keyed
          // by day name ('Monday') by merging both lookups.
          const scheduled = [
            ...(mealsBySlot.get(`${day.dbKey}:${slot.id}`) || []),
            ...(mealsBySlot.get(`${day.dayName}:${slot.id}`) || []),
          ];

          return (
            <div key={slot.id} style={{
              display: 'flex', alignItems: 'flex-start', padding: '16px 20px',
              borderBottom: i < MEAL_SLOTS.length - 1 ? '1px solid var(--hairline)' : 'none',
            }}>
              <div style={{ minWidth: 110, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: scheduled.length > 0 ? 8 : 4 }}>
                <div style={{ padding: 8, backgroundColor: `${slot.color}15`, borderRadius: 12, color: slot.color }}>
                  <Icon size={16} />
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{slot.id}</span>
              </div>

              <div style={{ flex: 1, paddingLeft: 8, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scheduled.map(meal => {
                  const linkedRecipe = meal.body?.recipeId ? recipeById.get(meal.body.recipeId) ?? null : null;
                  const thumb = safeImageUrl(linkedRecipe?.body?.image);
                  const displayTitle = linkedRecipe ? linkedRecipe.title : meal.body.customName || 'Meal';
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
                            {displayTitle}
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
                        onClick={() => onRemove(meal.id)}
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
                  onClick={() => onAdd(day.dbKey, day.label, slot.id)}
                >
                  <Plus size={16} /> {scheduled.length > 0 ? 'Add Another Recipe' : 'Add Recipe'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
