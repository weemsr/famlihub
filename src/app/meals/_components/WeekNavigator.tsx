import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function WeekNavigator({
  weekQualifier,
  weekRangeLabel,
  onPrev,
  onNext,
}: {
  weekQualifier: string | null;
  weekRangeLabel: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface-color)',
        border: '1px solid var(--hairline)',
        borderRadius: 16,
        padding: '8px 10px',
        marginBottom: 20,
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous week"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', display: 'inline-flex', touchAction: 'manipulation' }}
      >
        <ChevronLeft size={20} />
      </button>
      <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
        {weekQualifier && (
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-color)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {weekQualifier}
          </div>
        )}
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{weekRangeLabel}</div>
      </div>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next week"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)', display: 'inline-flex', touchAction: 'manipulation' }}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
