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

      {/* minmax(0, 1fr) rather than 1fr: a bare `1fr` floors each track at its
          min-content size, and because the cells below are square that floor
          comes from their *height* (~55px). Seven of those plus gaps is wider
          than an iPhone, which pushed the whole page into a sideways scroll and
          clipped Saturday off the screen. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, textAlign: 'center', fontWeight: 800, marginBottom: 6, fontSize: 'clamp(0.62rem, 2.6vw, 0.76rem)', color: 'var(--text-secondary)', letterSpacing: 0.4 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => <div key={d}>{d}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
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
                // Lets the track actually shrink; without it the square cell's
                // min-content height becomes a min-content width.
                minWidth: 0,
                padding: '4px 3px',
                borderRadius: 10,
                background: isToday ? 'var(--accent-color)' : 'var(--surface-hover)',
                color: isToday ? 'white' : 'var(--text-primary)',
                border: isSelected ? '2px solid var(--accent-color)' : '2px solid transparent',
                outline: isSelected && isToday ? '2px solid var(--surface-color)' : 'none',
                outlineOffset: isSelected && isToday ? '-4px' : '0',
                fontWeight: isToday ? 700 : 500,
                // Scales with the viewport so the number still fits once the
                // cell is ~40px wide on a phone.
                fontSize: 'clamp(0.78rem, 3.2vw, 1rem)',
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
              {/* Two bars, not three: at phone width the cell is ~40px and a
                  three-bar stack plus the overflow count no longer fits under
                  the date. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 10, justifyContent: 'flex-end' }}>
                {count > 0 && (
                  <>
                    {dayEvents.slice(0, 2).map((ev, idx) => (
                      <span
                        key={ev.uid + idx}
                        aria-hidden
                        style={{
                          height: 3,
                          borderRadius: 2,
                          background: isToday ? 'rgba(255,255,255,0.9)' : ev.color,
                          width: ev.allDay ? '100%' : '80%',
                          alignSelf: ev.allDay ? 'stretch' : 'center',
                          opacity: idx === 0 ? 1 : 0.8,
                        }}
                      />
                    ))}
                    {count > 2 && (
                      <span style={{
                        fontSize: 'clamp(0.5rem, 2vw, 0.6rem)',
                        fontWeight: 800,
                        color: isToday ? 'rgba(255,255,255,0.95)' : 'var(--text-secondary)',
                        lineHeight: 1,
                        textAlign: 'center',
                        marginTop: 1,
                      }}>+{count - 2}</span>
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
