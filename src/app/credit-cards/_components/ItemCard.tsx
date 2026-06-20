"use client";
import { Edit2, Trash2, CreditCard } from 'lucide-react';
import type { CreditCardItem } from '@/lib/types';
import StatusPill from './StatusPill';
import { fmtDateFriendly, fmtMoney, statusFor } from './utils';

export default function ItemCard({
  item,
  todayIso,
  onEdit,
  onDelete,
}: {
  item: CreditCardItem;
  todayIso: string;
  onEdit: (item: CreditCardItem) => void;
  onDelete: (id: string) => void;
}) {
  const body = item.body || {};
  const { status, daysFromNow } = statusFor(body, todayIso);
  const fee = typeof body.annualFee === 'number' ? body.annualFee : 0;

  return (
    <div className="card" style={{ marginBottom: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          aria-hidden
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(30, 58, 138, 0.10)',
            color: '#1E3A8A',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CreditCard size={20} strokeWidth={2.1} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </h3>
              {(body.bank || body.last4) && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {body.bank && <span>{body.bank}</span>}
                  {body.last4 && (
                    <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>
                      •••• {body.last4}
                    </span>
                  )}
                </div>
              )}
            </div>
            <StatusPill status={status} daysFromNow={daysFromNow} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, rowGap: 4, marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>{fmtMoney(fee)}</strong> annual fee
            </span>
            {body.cancelBy && (
              <span>
                Cancel by <strong style={{ color: 'var(--text-primary)' }}>{fmtDateFriendly(body.cancelBy)}</strong>
              </span>
            )}
          </div>

          {body.notes && (
            <p className="text-sm" style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
              {body.notes}
            </p>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', width: 'auto', fontSize: '0.82rem', borderRadius: 999, touchAction: 'manipulation' }}
              onClick={() => onEdit(item)}
            >
              <Edit2 size={14} /> Edit
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: '6px 12px', width: 'auto', fontSize: '0.82rem', borderRadius: 999, background: 'transparent', color: 'var(--danger-color)', touchAction: 'manipulation' }}
              onClick={() => onDelete(item.id)}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
