import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtDayLong, isoDay, type GoogleEvent } from './utils';

interface Cell { iso: string | null; dayNum: number | null }

export default function MonthGrid({
  cursor,
  todayIso,
  selectedDay,
  eventsByDay,
  onPrev,
  onNext,
  onSelectDay,
}: {
  cursor: Date;
  todayIso: string;
  selectedDay: string | null;
  eventsByDay: Map<string, GoogleEvent[]>;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (iso: string | null) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Cell[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ iso: null, dayNum: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoDay(new Date(year, month, d)), dayNum: d });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null, dayNum: null });

  const monthLabel = cursor.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button type="button" onClick={onPrev} aria-label="Previous month" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}>
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ marginBottom: 0 }}>{monthLabel}</h2>
        <button type="button" onClick={onNext} aria-label="Next month" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', touchAction: 'manipulation' }}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontWeight: 800, marginBottom: 6, fontSize: '0.76rem', color: 'var(--text-secondary)', letterSpacing: 0.6 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => <div key={d}>{d}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((cell, i) => {
          if (!cell.iso || cell.dayNum === null) {
            return <div key={`blank-${i}`} style={{ aspectRatio: '1 / 1' }} aria-hidden />;
          }
          const dayEvents = eventsByDay.get(cell.iso) || [];
          const isToday = cell.iso === todayIso;
          const isSelected = cell.iso === selectedDay;
          const count = dayEvents.length;

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : cell.iso)}
              aria-label={`${fmtDayLong(cell.iso)}${count ? `, ${count} event${count > 1 ? 's' : ''}` : ''}`}
              aria-pressed={isSelected}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                maxHeight: 64,
                padding: '5px 4px',
                borderRadius: 10,
                background: isToday ? 'var(--accent-color)' : 'var(--surface-hover)',
                color: isToday ? 'white' : 'var(--text-primary)',
                border: isSelected ? '2px solid var(--accent-color)' : '2px solid transparent',
                outline: isSelected && isToday ? '2px solid var(--surface-color)' : 'none',
                outlineOffset: isSelected && isToday ? '-4px' : '0',
                fontWeight: isToday ? 700 : 500,
                fontSize: '1rem',
                cursor: 'pointer',
                touchAction: 'manipulation',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <span style={{ textAlign: 'center', lineHeight: 1.1 }}>{cell.dayNum}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 12, justifyContent: 'flex-end' }}>
                {count > 0 && (
                  <>
                    {dayEvents.slice(0, 3).map((ev, idx) => (
                      <span
                        key={ev.uid + idx}
                        aria-hidden
                        style={{
                          height: 3,
                          borderRadius: 2,
                          background: isToday ? 'rgba(255,255,255,0.9)' : ev.color,
                          width: ev.allDay ? '100%' : '80%',
                          alignSelf: ev.allDay ? 'stretch' : 'center',
                          opacity: idx === 0 ? 1 : idx === 1 ? 0.8 : 0.6,
                        }}
                      />
                    ))}
                    {count > 3 && (
                      <span style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        color: isToday ? 'rgba(255,255,255,0.95)' : 'var(--text-secondary)',
                        lineHeight: 1,
                        textAlign: 'center',
                        marginTop: 1,
                      }}>+{count - 3}</span>
                    )}
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
