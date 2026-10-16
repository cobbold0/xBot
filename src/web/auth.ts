import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { env } from '../core/config';
import { prisma } from '../core/db/prisma';
import { auth } from './better-auth';

const COOKIE = 'xbot_session';
const TTL_MS = 30 * 24 * 3600 * 1000;
const LEGACY_TTL_MS = 12 * 3600 * 1000;

function secret() {
  const s = env().SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (>= 32 chars)');
  return s;
}
const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('hex');
const eq = (a: string, b: string) => { const A = Buffer.from(a), B = Buffer.from(b); return A.length === B.length && timingSafeEqual(A, B); };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64).toString('hex');
  return eq(derived, hash);
}

export function checkPassword(input: string): boolean {
  const p = env().DASHBOARD_PASSWORD;
  if (!p) return false;
  return eq(createHmac('sha256', 'pw').update(input).digest('hex'), createHmac('sha256', 'pw').update(p).digest('hex'));
}

export function makeToken(now = Date.now()): string {
  const exp = String(now + LEGACY_TTL_MS);
  return `${exp}.${sign(exp)}`;
}
export function verifyToken(t: string | undefined, now = Date.now()): boolean {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return eq(sig, sign(exp));
}

export async function getCurrentUser() {
  try {
    const val = (await cookies()).get(COOKIE)?.value;
    if (val?.startsWith('db:')) {
      const token = val.slice(3);
      const sess = await prisma.session.findUnique({ where: { token }, include: { user: true } });
      if (sess && sess.expiresAt > new Date()) return sess.user;
    }
    const baSession = await auth.api.getSession({ headers: await headers() }).catch(() => null);
    if (baSession?.user?.id) {
      const u = await prisma.user.findUnique({ where: { id: baSession.user.id } });
      if (u) return u;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function isAuthed(): Promise<boolean> {
  try {
    const u = await getCurrentUser();
    if (u) return true;
    return verifyToken((await cookies()).get(COOKIE)?.value);
  } catch {
    return false;
  }
}

export async function createUserSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.session.create({
    data: { id: randomUUID(), userId, token, expiresAt },
  });
  (await cookies()).set(COOKIE, `db:${token}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true',
    path: '/',
    maxAge: TTL_MS / 1000,
  });
}

export async function setSession() {
  (await cookies()).set(COOKIE, makeToken(), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true', path: '/', maxAge: LEGACY_TTL_MS / 1000 });
}

export async function clearSession() {
  const jar = await cookies();
  const val = jar.get(COOKIE)?.value;
  if (val?.startsWith('db:')) {
    await prisma.session.deleteMany({ where: { token: val.slice(3) } }).catch(() => {});
  }
  jar.delete(COOKIE);
}

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
