import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { getCurrentUser, isAuthed } from '@/web/auth';
import { prisma } from '@/core/db/prisma';
import { findOrCreateXUser } from '../x-login/route';

export const dynamic = 'force-dynamic';

const OptionalXBody = z.object({
  authToken: z.string().trim().min(10).max(300).optional(),
  ct0: z.string().trim().min(10).max(500).optional(),
  twid: z.string().trim().min(3).max(100).optional(),
  baseUrl: z.string().trim().max(300).optional(),
}).optional();

/** Generates a 5-minute QR Code + 6-digit pairing code (usable from Dashboard or directly from the Chrome Extension). */
export const POST = guard(async (req) => {
  const body = OptionalXBody.parse(await req.json().catch(() => ({})));
  let user = await getCurrentUser();

  if (!user && body?.authToken && body?.ct0 && body?.twid) {
    user = await findOrCreateXUser(body.authToken, body.ct0, body.twid);
  }

  if (!user && (await isAuthed())) {
    const first = await prisma.user.findFirst();
    user = first ?? await prisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Admin',
        email: 'admin@justbot.local',
        hasCustomEmail: false,
      },
    });
  }

  if (!user) throw new HttpError(401, 'Sign in or provide X credentials from the extension first.');

  await prisma.devicePairing.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const code = String(randomInt(100000, 999999));
  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.devicePairing.upsert({
    where: { code },
    update: { token, userId: user.id, expiresAt },
    create: { code, token, userId: user.id, expiresAt },
  });

  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const fwdHost = (req.headers.get('x-forwarded-host') || req.headers.get('host'))?.split(',')[0]?.trim();
  const inferredOrigin = fwdHost ? `${fwdProto || 'https'}://${fwdHost}` : new URL(req.url).origin;
  const origin = (body?.baseUrl || inferredOrigin).replace(/\/+$/, '');
  const pairUrl = `${origin}/api/auth/pair?token=${token}`;
  const qrSvg = await QRCode.toString(pairUrl, { type: 'svg', margin: 1, width: 200 });

  return { ok: true, code, pairUrl, qrSvg, expiresAt: expiresAt.toISOString(), username: user.xUsername || user.name };
}, { public: true });
