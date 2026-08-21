import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  listProviders,
  parseScanResponse,
  SCAN_PROMPT,
  type ScanItem,
  type VisionProvider,
} from '@/lib/pantry-scan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The client downscales before upload; this is the backstop against a large
// payload reaching a paid provider.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 45000;

// This is the only route that spends money per call, and it fans out one
// upstream request per configured provider. A 20-photo batch is 20 POSTs, so
// the ceiling has to clear a legitimate batch while still stopping a runaway
// loop. Per-instance and best-effort — same caveat as any in-memory state on
// serverless — but it turns "unbounded" into "bounded per warm instance".
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_REQUESTS = 60;
const RATE_MAX_TRACKED_USERS = 5000;
const recentScans = new Map<string, number[]>();

/** Returns true when the caller is over budget for the current window. */
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  const hits = (recentScans.get(userId) ?? []).filter(t => t > cutoff);
  if (hits.length >= RATE_MAX_REQUESTS) {
    recentScans.set(userId, hits);
    return true;
  }

  hits.push(now);
  recentScans.set(userId, hits);

  // Bound memory: drop users whose window has fully expired, then oldest-first
  // if that wasn't enough (Map iterates in insertion order).
  if (recentScans.size > RATE_MAX_TRACKED_USERS) {
    for (const [key, times] of recentScans) {
      if (times.length === 0 || times[times.length - 1] <= cutoff) recentScans.delete(key);
    }
    for (const key of recentScans.keys()) {
      if (recentScans.size <= RATE_MAX_TRACKED_USERS) break;
      if (key !== userId) recentScans.delete(key);
    }
  }
  return false;
}

/** Verify the caller's Supabase JWT; returns the user id or null. */
async function requireUser(req: Request): Promise<string | null> {
  const jwt = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1];
  if (!jwt) return null;
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(jwt);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/** Advertise which provider slots are configured. Labels only — never keys. */
export async function GET(req: Request) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    providers: listProviders().map(p => ({ id: p.id, label: p.label })),
  });
}

interface ProviderResult {
  providerId: string;
  label: string;
  items: ScanItem[];
  elapsedMs: number;
  error?: string;
}

async function scanWithProvider(
  provider: VisionProvider,
  dataUrl: string,
): Promise<ProviderResult> {
  const started = Date.now();
  const base: Omit<ProviderResult, 'items' | 'error'> = {
    providerId: provider.id,
    label: provider.label,
    elapsedMs: 0,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: SCAN_PROMPT },
          ],
        }],
        // JSON mode is far more portable across providers than strict
        // json_schema; parseScanResponse validates regardless.
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Never surface the provider's raw body — it can echo the key or
      // internal details back to the browser.
      return { ...base, items: [], elapsedMs: Date.now() - started, error: `Provider error (HTTP ${res.status})` };
    }

    const json = await res.json() as { choices?: { message?: { content?: unknown } }[] };
    const content = json.choices?.[0]?.message?.content;
    const items = parseScanResponse(typeof content === 'string' ? content : '');
    return {
      ...base,
      items,
      elapsedMs: Date.now() - started,
      ...(items.length === 0 ? { error: 'No items recognized in this photo.' } : {}),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ...base,
      items: [],
      elapsedMs: Date.now() - started,
      error: aborted ? 'Timed out after 45s.' : 'Could not reach the provider.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const userId = await requireUser(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (isRateLimited(userId)) {
    return NextResponse.json(
      { error: 'Too many scans in a short window. Give it a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    );
  }

  let body: { imageBase64?: unknown; mediaType?: unknown; providerIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { imageBase64, mediaType } = body;
  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return NextResponse.json({ error: 'No image supplied.' }, { status: 400 });
  }
  if (typeof mediaType !== 'string' || !/^image\/(jpeg|png|webp)$/.test(mediaType)) {
    return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 });
  }
  // base64 inflates by ~4/3; check the decoded size.
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'That photo is too large. Try again.' }, { status: 413 });
  }

  const configured = listProviders();
  if (configured.length === 0) {
    return NextResponse.json({ error: 'No vision provider is configured.' }, { status: 501 });
  }

  const requested = Array.isArray(body.providerIds)
    ? configured.filter(p => (body.providerIds as unknown[]).includes(p.id))
    : configured;
  const targets = requested.length > 0 ? requested : [configured[0]];

  const dataUrl = `data:${mediaType};base64,${imageBase64}`;

  // Fan out in parallel so one slow or failing provider can't block the rest.
  const settled = await Promise.allSettled(targets.map(p => scanWithProvider(p, dataUrl)));
  const results: ProviderResult[] = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { providerId: targets[i].id, label: targets[i].label, items: [], elapsedMs: 0, error: 'Scan failed.' },
  );

  return NextResponse.json({ results });
}
