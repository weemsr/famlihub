import type { Status } from './utils';

export default function StatusPill({ status, daysFromNow }: { status: Status; daysFromNow: number }) {
  const styles = {
    overdue: { bg: '#fee2e2', fg: '#991b1b', label: `${Math.abs(daysFromNow)} day${Math.abs(daysFromNow) === 1 ? '' : 's'} overdue` },
    'due-soon': { bg: '#fef3c7', fg: '#92400e', label: daysFromNow === 0 ? 'Due today' : `Due in ${daysFromNow} day${daysFromNow === 1 ? '' : 's'}` },
    'on-track': { bg: '#dcfce7', fg: '#166534', label: `Next in ${daysFromNow} day${daysFromNow === 1 ? '' : 's'}` },
    'never-done': { bg: 'var(--surface-hover)', fg: 'var(--text-secondary)', label: 'Never done' },
  }[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 999,
      background: styles.bg, color: styles.fg,
      fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.2,
    }}>
      {styles.label}
    </span>
  );
}
