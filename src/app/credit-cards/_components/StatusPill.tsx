import type { Status } from './utils';

export default function StatusPill({ status, daysFromNow }: { status: Status; daysFromNow: number }) {
  const styles = {
    past: {
      bg: '#fee2e2', fg: '#991b1b',
      label: daysFromNow === 0
        ? 'Cancel today'
        : `${Math.abs(daysFromNow)} day${Math.abs(daysFromNow) === 1 ? '' : 's'} overdue`,
    },
    soon: {
      bg: '#fef3c7', fg: '#92400e',
      label: `Cancel in ${daysFromNow} day${daysFromNow === 1 ? '' : 's'}`,
    },
    upcoming: {
      bg: '#dcfce7', fg: '#166534',
      label: `In ${daysFromNow} days`,
    },
    none: {
      bg: 'var(--surface-hover)', fg: 'var(--text-secondary)',
      label: 'No date',
    },
  }[status];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 999,
      background: styles.bg, color: styles.fg,
      fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.2,
      whiteSpace: 'nowrap',
    }}>
      {styles.label}
    </span>
  );
}
