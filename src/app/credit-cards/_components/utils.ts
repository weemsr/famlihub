import type { CreditCardBody } from '@/lib/types';

/**
 * Status buckets for cancel-by urgency:
 * - past:      cancelBy is today or earlier (act now)
 * - soon:      cancelBy is within 30 days
 * - upcoming:  cancelBy is more than 30 days out
 * - none:      no cancelBy set
 */
export type Status = 'past' | 'soon' | 'upcoming' | 'none';

export interface FormState {
  id?: string;
  title: string;
  bank: string;
  last4: string;     // last 4 digits (kept as a string of up to 4 digits)
  annualFee: string; // string for input control; parsed at save
  cancelBy: string;  // YYYY-MM-DD
  notes: string;
}

export const EMPTY_FORM: FormState = {
  title: '',
  bank: '',
  last4: '',
  annualFee: '',
  cancelBy: '',
  notes: '',
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

/**
 * Urgency status + days until the cancel-by date. Cards without a date sort
 * to the end (Infinity); the most overdue card ends up first when sorted
 * ascending by `daysFromNow`.
 */
export function statusFor(body: CreditCardBody, todayIso: string): { status: Status; daysFromNow: number } {
  if (!body.cancelBy) return { status: 'none', daysFromNow: Number.POSITIVE_INFINITY };
  const daysFromNow = daysBetween(todayIso, body.cancelBy);
  if (daysFromNow <= 0) return { status: 'past', daysFromNow };
  if (daysFromNow <= 30) return { status: 'soon', daysFromNow };
  return { status: 'upcoming', daysFromNow };
}

export function fmtDateFriendly(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  // No decimals for whole dollars; keep cents only when set.
  return n % 1 === 0 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`;
}
