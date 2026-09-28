import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '../core/config';

const COOKIE = 'xbot_session';
const TTL_MS = 12 * 3600 * 1000;

function secret() {
  const s = env().SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (>= 32 chars)');
  return s;
}
const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('hex');
const eq = (a: string, b: string) => { const A = Buffer.from(a), B = Buffer.from(b); return A.length === B.length && timingSafeEqual(A, B); };

export function checkPassword(input: string): boolean {
  const p = env().DASHBOARD_PASSWORD;
  if (!p) return false;
  return eq(createHmac('sha256', 'pw').update(input).digest('hex'), createHmac('sha256', 'pw').update(p).digest('hex'));
}

export function makeToken(now = Date.now()): string {
  const exp = String(now + TTL_MS);
  return `${exp}.${sign(exp)}`;
}
export function verifyToken(t: string | undefined, now = Date.now()): boolean {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return eq(sig, sign(exp));
}

export async function isAuthed(): Promise<boolean> {
  try { return verifyToken((await cookies()).get(COOKIE)?.value); } catch { return false; }
}
export async function setSession() {
  (await cookies()).set(COOKIE, makeToken(), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true', path: '/', maxAge: TTL_MS / 1000 });
}
export async function clearSession() { (await cookies()).delete(COOKIE); }

/** Simple in-memory login throttle (per process). */
const attempts = new Map<string, { n: number; reset: number }>();
export function loginAllowed(ip: string, now = Date.now()): boolean {
  const a = attempts.get(ip);
  if (!a || a.reset < now) return true;
  return a.n < 5;
}
export function loginFailed(ip: string, now = Date.now()) {
  const a = attempts.get(ip);
  if (!a || a.reset < now) attempts.set(ip, { n: 1, reset: now + 15 * 60_000 });
  else a.n++;
}
