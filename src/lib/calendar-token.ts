/**
 * HMAC-signed tokens for the per-user ICS calendar feed. The token encodes
 * the user's UUID and is signed with CALENDAR_SIGNING_SECRET so it can be
 * verified server-side without a database lookup. Treat the URL like a
 * password: whoever holds it can read the user's meal plan.
 *
 * Server-only: uses node:crypto.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function getSecret(): string {
  const s = process.env.CALENDAR_SIGNING_SECRET;
  if (!s || s.length < 16) {
    throw new Error('CALENDAR_SIGNING_SECRET is missing or too short (need 16+ chars)');
  }
  return s;
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(payload).digest());
}

/**
 * Sign a token for the given user id. Deterministic — same input always
 * produces the same token, so the subscribed URL is stable.
 */
export function signCalendarToken(userId: string): string {
  const payload = `${VERSION}.${userId}`;
  const sig = sign(payload, getSecret());
  return `${payload}.${sig}`;
}

/**
 * Verify a token and return the embedded user id, or null if the token is
 * invalid/expired/tampered.
 */
export function verifyCalendarToken(token: string): string | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, userId, sig] = parts;
  if (version !== VERSION) return null;
  if (!userId) return null;

  const expected = sign(`${version}.${userId}`, getSecret());

  // Constant-time comparison.
  const a = fromBase64url(sig);
  const b = fromBase64url(expected);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return userId;
}
