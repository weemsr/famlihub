import type { MaintenanceBody } from '@/lib/types';

export type Status = 'overdue' | 'due-soon' | 'on-track' | 'never-done';

export interface IntervalPreset {
  days: number;
  label: string;
}

export const INTERVAL_PRESETS: IntervalPreset[] = [
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Every 6 months' },
  { days: 365, label: 'Yearly' },
];

export interface FormState {
  id?: string;
  title: string;
  intervalDays: number;
  intervalPreset: number | 'custom';
  customDays: string;
  lastDone: string;
  note: string;
}

export const EMPTY_FORM: FormState = {
  title: '',
  intervalDays: 180,
  intervalPreset: 180,
  customDays: '',
  lastDone: '',
  note: '',
};

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(earlierIso: string, laterIso: string): number {
  const [ey, em, ed] = earlierIso.split('-').map(Number);
  const [ly, lm, ld] = laterIso.split('-').map(Number);
  const a = Date.UTC(ey, em - 1, ed);
  const b = Date.UTC(ly, lm - 1, ld);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

export function statusFor(body: MaintenanceBody, todayIso: string): { status: Status; daysFromNow: number } {
  if (!body.lastDone) return { status: 'never-done', daysFromNow: 0 };
  const elapsed = daysBetween(body.lastDone, todayIso);
  const daysFromNow = body.intervalDays - elapsed;
  if (daysFromNow < 0) return { status: 'overdue', daysFromNow };
  if (daysFromNow <= 14) return { status: 'due-soon', daysFromNow };
  return { status: 'on-track', daysFromNow };
}

export function statusRank(s: Status): number {
  return { overdue: 0, 'due-soon': 1, 'never-done': 2, 'on-track': 3 }[s];
}

export function fmtInterval(days: number): string {
  const preset = INTERVAL_PRESETS.find(p => p.days === days);
  if (preset) return preset.label;
  if (days === 1) return 'Daily';
  if (days === 7) return 'Weekly';
  if (days % 365 === 0) return `Every ${days / 365} year${days === 365 ? '' : 's'}`;
  if (days % 30 === 0) return `Every ${days / 30} months`;
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  return `Every ${days} days`;
}

export function fmtDateFriendly(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
