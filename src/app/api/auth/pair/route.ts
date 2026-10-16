import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { createUserSession } from '@/web/auth';
import { prisma } from '@/core/db/prisma';

export const dynamic = 'force-dynamic';

/** Scanned via mobile camera QR code: logs the mobile device in and redirects to /. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim();
  if (!token) return NextResponse.redirect(new URL('/login?err=invalid_qr', req.url));

  const pairing = await prisma.devicePairing.findUnique({ where: { token } });
  if (!pairing || pairing.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/login?err=expired_qr', req.url));
  }

  await prisma.devicePairing.delete({ where: { code: pairing.code } }).catch(() => {});
  await createUserSession(pairing.userId);
  return NextResponse.redirect(new URL('/', req.url));
}

const CodeBody = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict();

/** Entered as a 6-digit code on the mobile /login screen. */
export const POST = guard(async (req) => {
  const { code } = CodeBody.parse(await req.json());
  const pairing = await prisma.devicePairing.findUnique({ where: { code } });
  if (!pairing || pairing.expiresAt < new Date()) {
    throw new HttpError(400, 'Invalid or expired 6-digit pairing code.');
  }
  await prisma.devicePairing.delete({ where: { code } }).catch(() => {});
  await createUserSession(pairing.userId);
  return { ok: true };
}, { public: true });
