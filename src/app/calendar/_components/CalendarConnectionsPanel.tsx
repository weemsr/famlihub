"use client";
import { useState } from 'react';
import { Link2, ChevronUp, ChevronDown, Pencil, Trash2, Check, Plus, Info, RefreshCw } from 'lucide-react';
import { CALENDAR_COLOR_PALETTE, CALENDAR_DEFAULT_COLOR, type GoogleCalendarEntry } from '@/lib/types';
import { isGoogleIcalUrl, newEntryId, nextUnusedColor, type CalendarStatus } from './utils';

export default function CalendarConnectionsPanel({
  entries,
  calendarStatuses,
  totalEvents,
  googleFetching,
  onPersist,
  onRefresh,
}: {
  entries: GoogleCalendarEntry[];
  calendarStatuses: CalendarStatus[];
  totalEvents: number;
  googleFetching: boolean;
  onPersist: (next: GoogleCalendarEntry[]) => Promise<void>;
  onRefresh: () => void;
}) {
  const hasAnyCalendar = entries.length > 0;

  const [showPanel, setShowPanel] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(CALENDAR_DEFAULT_COLOR);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [showGcalHow, setShowGcalHow] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(CALENDAR_DEFAULT_COLOR);

  const onAddBarShow = () => {
    setShowAdd(true);
    setNewColor(nextUnusedColor(entries));
  };

  const saveAdd = async () => {
    const url = newUrl.trim();
    if (!isGoogleIcalUrl(url)) {
      setAddError("That doesn't look like a Google Calendar secret iCal URL. It should start with https://calendar.google.com/calendar/ical/");
      return;
    }
    setAddError(null);
    setAddSaving(true);
    try {
      const entry: GoogleCalendarEntry = {
        id: newEntryId(),
        name: newName.trim() || 'Google Calendar',
        url,
        color: newColor,
      };
      const next = [...entries, entry];
      await onPersist(next);
      setNewUrl(''); setNewName(''); setShowAdd(false);
      setNewColor(nextUnusedColor(next));
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setAddSaving(false);
    }
  };

  const removeEntry = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Remove this calendar? Events from it will disappear.')) return;
    const next = entries.filter(e => e.id !== id);
    try { await onPersist(next); } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
  };

  const startEditEntry = (entry: GoogleCalendarEntry) => {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditColor(entry.color);
  };

  const saveEditEntry = async () => {
    if (!editingId) return;
    const next = entries.map(e => e.id === editingId ? { ...e, name: editName.trim() || e.name, color: editColor } : e);
    try { await onPersist(next); setEditingId(null); }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
  };

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setShowPanel(v => !v)}
        aria-expanded={showPanel}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: 10,
          marginBottom: showPanel ? 8 : 0,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
          touchAction: 'manipulation',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Link2 size={20} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
          <h3 style={{ marginBottom: 0 }}>
            {hasAnyCalendar ? 'Connected calendars' : 'Show my Google Calendar here'}
          </h3>
          {hasAnyCalendar && !showPanel && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              · {entries.length}
            </span>
          )}
        </span>
        {showPanel
          ? <ChevronUp size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          : <ChevronDown size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
      </button>

      {showPanel && <>
      {!hasAnyCalendar && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
          Paste your Google Calendar&apos;s secret iCal URL to start. You can add more calendars later — each gets its own color.
        </p>
      )}

      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {entries.map(entry => {
            const status = calendarStatuses.find(s => s.id === entry.id);
            const isEditing = editingId === entry.id;
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--surface-hover)',
                  borderRadius: 10,
                  borderLeft: `4px solid ${entry.color}`,
                }}
              >
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      className="input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Calendar name"
                      style={{ padding: '8px 14px', fontSize: '0.9rem' }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {CALENDAR_COLOR_PALETTE.map(c => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Color ${c}`}
                          onClick={() => setEditColor(c)}
                          style={{
                            width: 26, height: 26, borderRadius: 999,
                            background: c,
                            border: editColor.toLowerCase() === c.toLowerCase() ? '3px solid var(--text-primary)' : '2px solid var(--hairline)',
                            cursor: 'pointer', touchAction: 'manipulation',
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn" onClick={saveEditEntry} style={{ width: 'auto', padding: '6px 14px', fontSize: '0.85rem', touchAction: 'manipulation' }}>
                        <Check size={14} /> Save
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ width: 'auto', padding: '6px 14px', fontSize: '0.85rem', touchAction: 'manipulation' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{entry.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {status?.error
                          ? <span style={{ color: 'var(--danger-color)' }}>Error: {status.error}</span>
                          : `${status?.count ?? 0} events`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => startEditEntry(entry)}
                        aria-label="Edit calendar"
                        style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', touchAction: 'manipulation' }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        aria-label="Remove calendar"
                        style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', touchAction: 'manipulation' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!showAdd ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onAddBarShow}
          style={{ width: 'auto', padding: '8px 16px', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6, touchAction: 'manipulation' }}
        >
          <Plus size={16} /> {hasAnyCalendar ? 'Add calendar' : 'Connect a calendar'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="input"
              placeholder="https://calendar.google.com/calendar/ical/..."
              value={newUrl}
              onChange={e => { setNewUrl(e.target.value); setAddError(null); }}
              style={{ fontSize: '0.85rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '10px 14px' }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0 16px', width: 'auto', fontSize: '13px', touchAction: 'manipulation' }}
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setNewUrl(text.trim());
                  setAddError(null);
                } catch (err) {
                  console.error('Clipboard error', err);
                  setAddError("Couldn't read clipboard. Paste manually instead.");
                }
              }}
              disabled={addSaving}
            >
              Paste 📋
            </button>
          </div>
          <input
            type="text"
            className="input"
            placeholder="Label (e.g., Work, Mom, Kids)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ padding: '10px 14px', fontSize: '0.9rem' }}
          />
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Color</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CALENDAR_COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 30, height: 30, borderRadius: 999,
                    background: c,
                    border: newColor.toLowerCase() === c.toLowerCase() ? '3px solid var(--text-primary)' : '2px solid var(--hairline)',
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}
                />
              ))}
            </div>
          </div>
          {addError && (
            <p className="text-sm" style={{ color: 'var(--danger-color)' }}>{addError}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={saveAdd}
              disabled={addSaving || !newUrl.trim()}
              style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
            >
              {addSaving ? 'Saving…' : 'Add calendar'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setShowAdd(false); setNewUrl(''); setNewName(''); setAddError(null); }}
              style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {hasAnyCalendar && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {totalEvents} events loaded for this view.
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={googleFetching}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.82rem', touchAction: 'manipulation', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <RefreshCw size={14} /> {googleFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowGcalHow(v => !v)}
        style={{ marginTop: 12, background: 'transparent', border: 'none', padding: 0, color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <Info size={14} /> {showGcalHow ? 'Hide instructions' : 'Where do I find this URL?'}
      </button>

      {showGcalHow && (
        <ol style={{ marginTop: 10, marginBottom: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
          <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Google Calendar</a> on a desktop.</li>
          <li>In the left sidebar under <em>My calendars</em>, hover over the calendar you want to see, click the <strong>⋮</strong> (three dots), then <strong>Settings and sharing</strong>.</li>
          <li>Scroll down to <strong>Integrate calendar</strong>.</li>
          <li>Copy the URL labeled <strong>Secret address in iCal format</strong> (not the Public one).</li>
          <li>Paste it above, pick a label + color, and click Add calendar.</li>
        </ol>
      )}

      <p className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: 14, marginBottom: 0, fontSize: '0.78rem' }}>
        These URLs are private — keep them out of shared channels. They&apos;re used only by FamLi&apos;s server to fetch events.
      </p>
      </>}
    </div>
  );
}
