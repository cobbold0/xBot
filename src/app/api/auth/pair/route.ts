import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { createUserSession } from '@/web/auth';
import { prisma } from '@/core/db/prisma';

export const dynamic = 'force-dynamic';

function getPublicOrigin(req: Request): string {
  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const fwdHost = (req.headers.get('x-forwarded-host') || req.headers.get('host'))?.split(',')[0]?.trim();
  if (fwdHost && !fwdHost.startsWith('0.0.0.0')) {
    const proto = fwdProto || (fwdHost.startsWith('localhost') || fwdHost.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${fwdHost}`;
  }
  return new URL(req.url).origin;
}

/** Scanned via mobile camera QR code: logs the mobile device in and redirects to /. */
export async function GET(req: Request) {
  const origin = getPublicOrigin(req);
  const token = new URL(req.url).searchParams.get('token')?.trim();
  if (!token) return NextResponse.redirect(`${origin}/login?err=invalid_qr`);

  const pairing = await prisma.devicePairing.findUnique({ where: { token } });
  if (!pairing || pairing.expiresAt < new Date()) {
    return NextResponse.redirect(`${origin}/login?err=expired_qr`);
  }

  await prisma.devicePairing.delete({ where: { code: pairing.code } }).catch(() => {});
  await createUserSession(pairing.userId);
  return NextResponse.redirect(`${origin}/`);
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
