"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface PendingUndo {
  label: string;
  row: Record<string, unknown>;
  restore: () => void;
}

/**
 * Undo affordance for single-tap deletes. The caller performs its usual
 * optimistic removal + DB delete, then calls `offerUndo(label, row, restore)`
 * with the full original row (rows loaded via select('*') carry id/type/
 * user_id/created_at, so re-inserting restores the item byte-for-byte with
 * the same id — keeping references like meal→recipe intact).
 *
 * Undo restores local state immediately and re-inserts the row; the page's
 * realtime subscription then canonicalizes ordering.
 */
export function useUndoDelete() {
  const [pending, setPending] = useState<PendingUndo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const offerUndo = useCallback((label: string, row: Record<string, unknown>, restore: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setPending({ label, row, restore });
    timer.current = setTimeout(() => {
      timer.current = null;
      setPending(null);
    }, 5000);
  }, []);

  const undo = useCallback(() => {
    const p = pending;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
    if (!p) return;
    p.restore();
    supabase.from('items').insert(p.row).then(({ error }) => {
      if (error) {
        // Re-insert failed (rare: e.g. session expired). The realtime
        // subscription will reconcile local state with the server.
        console.error('Undo failed:', error.message);
      }
    });
  }, [pending]);

  const snackbar = pending ? (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 16px)',
        zIndex: 60, // above FAB (40), below bottom sheets (100)
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 'min(92vw, 420px)',
        padding: '10px 12px 10px 16px',
        background: 'var(--surface-color)',
        border: '1px solid var(--hairline-strong)',
        borderRadius: 999,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
      }}
    >
      <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Deleted “{pending.label}”
      </span>
      <button
        type="button"
        onClick={undo}
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--accent-hover)',
          fontWeight: 700,
          fontSize: '0.88rem',
          cursor: 'pointer',
          padding: '6px 10px',
          touchAction: 'manipulation',
        }}
      >
        Undo
      </button>
    </div>
  ) : null;

  return { offerUndo, snackbar };
}
