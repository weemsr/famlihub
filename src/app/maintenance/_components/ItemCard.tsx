import { Trash2, Pencil, CheckCircle2 } from 'lucide-react';
import type { MaintenanceItem } from '@/lib/types';
import StatusPill from './StatusPill';
import { fmtDateFriendly, fmtInterval, statusFor } from './utils';

export default function ItemCard({
  item,
  todayIso,
  onEdit,
  onDelete,
  onMarkDone,
}: {
  item: MaintenanceItem;
  todayIso: string;
  onEdit: (item: MaintenanceItem) => void;
  onDelete: (id: string) => void;
  onMarkDone: (item: MaintenanceItem) => void;
}) {
  const body = item.body || { intervalDays: 180 };
  const { status, daysFromNow } = statusFor(body, todayIso);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>{item.title}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{fmtInterval(body.intervalDays)}</div>
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label="Edit"
            style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', touchAction: 'manipulation' }}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            aria-label="Delete"
            style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', touchAction: 'manipulation' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <StatusPill status={status} daysFromNow={daysFromNow} />
        {body.lastDone && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Last done {fmtDateFriendly(body.lastDone)}
          </span>
        )}
      </div>

      {body.note && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {body.note}
        </div>
      )}

      <button
        type="button"
        onClick={() => onMarkDone(item)}
        className="btn"
        style={{ width: 'auto', padding: '8px 14px', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: 6, touchAction: 'manipulation' }}
      >
        <CheckCircle2 size={16} /> Mark done today
      </button>
    </div>
  );
}
