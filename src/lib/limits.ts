/**
 * Length caps for user free-text fields. Applied at the write path (so a row
 * can never store unbounded text) and mirrored as `maxLength` on the inputs.
 * The cap truncates rather than erroring — a paste that's too long is silently
 * clipped instead of failing the save.
 */
export const LIMITS = {
  title: 200,
  note: 2000,
  body: 5000,
  line: 500,
} as const;

export function capLen(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
