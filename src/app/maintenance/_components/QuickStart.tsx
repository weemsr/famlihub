import { MAINTENANCE_SEEDS } from '../seed';

export default function QuickStart({
  seedBusy,
  onAddSeed,
  onAddAll,
}: {
  seedBusy: string | 'all' | null;
  onAddSeed: (index: number) => void;
  onAddAll: () => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 6 }}>Quick start</h3>
      <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
        Tap any to add with a sensible default interval, or grab them all at once.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {MAINTENANCE_SEEDS.map((seed, i) => (
          <button
            key={seed.title}
            type="button"
            onClick={() => onAddSeed(i)}
            disabled={seedBusy !== null}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--surface-hover)', border: 'none',
              cursor: seedBusy ? 'default' : 'pointer',
              textAlign: 'left', color: 'var(--text-primary)', touchAction: 'manipulation',
              opacity: seedBusy !== null && seedBusy !== seed.title && seedBusy !== 'all' ? 0.6 : 1,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{seed.title}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {seed.intervalLabel}{seed.hint ? ` · ${seed.hint}` : ''}
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-color)', flexShrink: 0 }}>
              {seedBusy === seed.title || seedBusy === 'all' ? 'Adding…' : '+ Add'}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn"
        onClick={onAddAll}
        disabled={seedBusy !== null}
        style={{ width: 'auto', padding: '8px 16px', touchAction: 'manipulation' }}
      >
        {seedBusy === 'all' ? 'Adding all…' : 'Add all 6'}
      </button>
    </div>
  );
}
