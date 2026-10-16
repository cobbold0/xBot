import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { getCurrentUser, hashPassword } from '@/web/auth';
import { prisma } from '@/core/db/prisma';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
}).strict();

/** Allows a logged-in user (e.g. signed in via X Extension) to link or update an Email & Password for other devices. */
export const POST = guard(async (req) => {
  const b = Body.parse(await req.json());
  const email = b.email.toLowerCase();
  const pwHash = hashPassword(b.password);

  let current = await getCurrentUser();
  const conflict = await prisma.user.findUnique({ where: { email } });
  if (conflict && conflict.id !== current?.id) {
    throw new HttpError(400, 'That email is already linked to another account.');
  }

  if (!current) {
    const id = randomUUID();
    current = await prisma.user.create({
      data: {
        id,
        name: email.split('@')[0],
        email,
        passwordHash: pwHash,
        hasCustomEmail: true,
      },
    });
  } else {
    current = await prisma.user.update({
      where: { id: current.id },
      data: {
        email,
        passwordHash: pwHash,
        hasCustomEmail: true,
      },
    });
  }

  const existingAcc = await prisma.account.findFirst({
    where: { userId: current.id, providerId: 'credential' },
  });
  if (existingAcc) {
    await prisma.account.update({
      where: { id: existingAcc.id },
      data: { password: pwHash, accountId: email },
    });
  } else {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: current.id,
        accountId: email,
        providerId: 'credential',
        password: pwHash,
      },
    });
  }

  return { ok: true, email: current.email };
});
