import EventRow from './EventRow';
import { fmtDayShort, type GoogleEvent } from './utils';

export default function UpcomingList({
  days,
  todayIso,
}: {
  days: Array<{ iso: string; events: GoogleEvent[] }>;
  todayIso: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {days.map(({ iso, events }) => (
        <div key={iso}>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {iso === todayIso ? `Today · ${fmtDayShort(iso)}` : fmtDayShort(iso)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {events.map(ev => <EventRow key={ev.uid} ev={ev} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
