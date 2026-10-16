import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { createUserSession, hashPassword, loginAllowed, loginFailed, verifyPassword } from '@/web/auth';
import { prisma } from '@/core/db/prisma';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  mode: z.enum(['signin', 'signup']).default('signin'),
  name: z.string().trim().max(100).optional(),
}).strict();

export const POST = guard(async (req) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!loginAllowed(ip)) throw new HttpError(429, 'Too many attempts. Try again later.');

  const b = Body.parse(await req.json());
  const email = b.email.toLowerCase();

  if (b.mode === 'signup') {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(400, 'An account with this email already exists. Please sign in.');
    const pwHash = hashPassword(b.password);
    const userId = randomUUID();
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: b.name || email.split('@')[0],
        email,
        passwordHash: pwHash,
        hasCustomEmail: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: 'credential',
            password: pwHash,
          },
        },
      },
    });
    await createUserSession(user.id);
    return { ok: true, user: { id: user.id, email: user.email, name: user.name } };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(b.password, user.passwordHash)) {
    loginFailed(ip);
    throw new HttpError(401, 'Invalid email or password');
  }
  await createUserSession(user.id);
  return { ok: true, user: { id: user.id, email: user.email, name: user.name } };
}, { public: true });
