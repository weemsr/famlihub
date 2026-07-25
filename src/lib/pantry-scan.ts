import { LIMITS, capLen } from './limits';
import type { PantryLevel } from './types';

/**
 * Photo-scan support for the Pantry tab.
 *
 * Providers are configured as env-var slots (A/B/C) so any OpenAI-compatible
 * vision endpoint works — Gemini (via its compatibility layer), OpenAI, GLM,
 * Kimi — without a code change. With no slot configured the feature is inert:
 * the API reports zero providers and the UI hides the scan entry point.
 *
 *   VISION_A_LABEL=Gemini Flash-Lite
 *   VISION_A_BASE_URL=...        # OpenAI-compatible root, no trailing slash
 *   VISION_A_KEY=...
 *   VISION_A_MODEL=...
 */

export const PROVIDER_SLOTS = ['A', 'B', 'C'] as const;
export type ProviderSlot = (typeof PROVIDER_SLOTS)[number];

export interface VisionProvider {
  id: ProviderSlot;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Read one slot; returns null unless base URL, key, and model are all set. */
export function readProvider(slot: ProviderSlot): VisionProvider | null {
  const baseUrl = process.env[`VISION_${slot}_BASE_URL`];
  const apiKey = process.env[`VISION_${slot}_KEY`];
  const model = process.env[`VISION_${slot}_MODEL`];
  if (!baseUrl || !apiKey || !model) return null;
  return {
    id: slot,
    label: process.env[`VISION_${slot}_LABEL`] || model,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
  };
}

export function listProviders(): VisionProvider[] {
  return PROVIDER_SLOTS.map(readProvider).filter((p): p is VisionProvider => p !== null);
}

export interface ScanItem {
  name: string;
  quantity?: string;
  level?: PantryLevel;
}

const VALID_LEVELS: PantryLevel[] = ['low', 'medium', 'high'];
const MAX_ITEMS = 50;

/**
 * Validate a model's JSON reply into safe rows. This is the security boundary:
 * model output is untrusted, so anything malformed is dropped rather than
 * coerced, and the result is capped in both field length and row count.
 *
 * Accepts either `{"items":[...]}` or a bare array, and tolerates the
 * ```json fenced blocks some models emit despite JSON-mode.
 */
export function parseScanResponse(raw: string): ScanItem[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { items?: unknown })?.items)
      ? (parsed as { items: unknown[] }).items
      : null;
  if (!rows) return [];

  const out: ScanItem[] = [];
  for (const row of rows) {
    if (out.length >= MAX_ITEMS) break;
    if (!row || typeof row !== 'object') continue;
    const r = row as { name?: unknown; quantity?: unknown; level?: unknown };

    if (typeof r.name !== 'string') continue;
    const name = capLen(r.name.trim(), LIMITS.title);
    if (!name) continue;

    const item: ScanItem = { name };

    if (typeof r.quantity === 'string' && r.quantity.trim()) {
      item.quantity = capLen(r.quantity.trim(), LIMITS.title);
    } else if (typeof r.quantity === 'number' && Number.isFinite(r.quantity)) {
      item.quantity = String(r.quantity);
    }

    if (typeof r.level === 'string') {
      const level = r.level.trim().toLowerCase() as PantryLevel;
      if (VALID_LEVELS.includes(level)) item.level = level;
    }

    out.push(item);
  }
  return out;
}

/** Instruction sent with each photo. Deliberately conservative about guessing. */
export const SCAN_PROMPT = `You are helping build a kitchen inventory from a photo of a shelf.

List only food, drink, and grocery items you can actually SEE in this image.

Rules:
- Use short, plain names ("black beans", not "Goya Premium Black Beans 15.5oz").
- Include "quantity" ONLY when you can genuinely count the items in the photo (e.g. "3", "2 bags"). Omit it otherwise.
- Include "level" as "low", "medium", or "high" ONLY for things measured by fullness rather than count, like spices, oils, or a partly used bag.
- Do NOT guess at items that are hidden, unreadable, or that you merely expect to be there.
- Ignore non-food objects, shelves, and containers that are empty.

Respond with JSON only, in this exact shape:
{"items":[{"name":"black beans","quantity":"2"},{"name":"paprika","level":"low"}]}`;
