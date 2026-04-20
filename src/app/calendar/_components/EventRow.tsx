import { ExternalLink, MapPin } from 'lucide-react';
import { fmtTime, tintFor, type GoogleEvent } from './utils';

export default function EventRow({ ev }: { ev: GoogleEvent }) {
  if (ev.allDay) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10,
          background: tintFor(ev.color),
          borderLeft: `4px solid ${ev.color}`,
        }}
      >
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: ev.color, letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0 }}>
          All day
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {ev.htmlLink ? (
            <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {ev.title || '(no title)'}
              <ExternalLink size={12} style={{ opacity: 0.5 }} />
            </a>
          ) : (
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{ev.title || '(no title)'}</span>
          )}
          {ev.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <MapPin size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location}</span>
            </div>
          )}
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2, fontWeight: 600 }}>
            {ev.calendarName}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10,
        background: 'var(--surface-hover)',
        alignItems: 'flex-start',
        borderLeft: `4px solid ${ev.color}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 64, flexShrink: 0 }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: ev.color, letterSpacing: 0.3 }}>
          {fmtTime(ev.start)}
        </span>
        {ev.end && ev.end !== ev.start && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {fmtTime(ev.end)}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {ev.htmlLink ? (
          <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {ev.title || '(no title)'}
            <ExternalLink size={12} style={{ opacity: 0.5 }} />
          </a>
        ) : (
          <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{ev.title || '(no title)'}</span>
        )}
        {ev.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <MapPin size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location}</span>
          </div>
        )}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2, fontWeight: 600 }}>
          {ev.calendarName}
        </div>
      </div>
    </div>
  );
}
