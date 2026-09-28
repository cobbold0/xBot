import { createHash } from 'node:crypto';

export function normalize(t: string): string {
  return t.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export const textHash = (t: string) => createHash('sha256').update(normalize(t)).digest('hex');

function shingles(t: string): Set<string> {
  const w = normalize(t).split(' ').filter(Boolean);
  if (w.length < 3) return new Set(w);
  const s = new Set<string>();
  for (let i = 0; i <= w.length - 3; i++) s.add(w.slice(i, i + 3).join(' '));
  return s;
}

export function similarity(a: string, b: string): number {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function isNearDuplicate(text: string, existing: string[], threshold: number): boolean {
  const h = textHash(text);
  return existing.some((e) => textHash(e) === h || similarity(text, e) >= threshold);
}
