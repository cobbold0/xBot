import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkPassword, loginAllowed, loginFailed, setSession } from '@/web/auth';
import { guard, HttpError } from '@/web/api';

export const dynamic = 'force-dynamic';
export const POST = guard(async (req) => {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (!loginAllowed(ip)) throw new HttpError(429, 'too many attempts');
  const { password } = z.object({ password: z.string().min(1).max(500) }).parse(await req.json());
  if (!checkPassword(password)) { loginFailed(ip); throw new HttpError(401, 'invalid credentials'); }
  await setSession();
  return NextResponse.json({ ok: true });
}, { public: true });
