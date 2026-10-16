import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { createUserSession } from '@/web/auth';
import { prisma } from '@/core/db/prisma';
import { q } from '@/core/db/pool';
import { saveApiKey } from '@/core/x/credentials';
import { normalizeApiKey, RettiwtClient } from '@/core/x/rettiwt';
import { XError } from '@/core/x/types';
import { ensureTenantInitialized } from '@/core/tenant';

export const dynamic = 'force-dynamic';

const Body = z.object({
  authToken: z.string().trim().min(10).max(300),
  ct0: z.string().trim().min(10).max(500),
  twid: z.string().trim().min(3).max(100),
}).strict();

export async function findOrCreateXUser(authToken: string, ct0: string, twid: string) {
  const raw = `auth_token=${authToken};ct0=${ct0};twid=${twid};`;
  let verified: { id: string; username: string };
  try {
    verified = await new RettiwtClient(normalizeApiKey(raw)).verify();
  } catch (e) {
    throw new HttpError(400, e instanceof XError ? e.message : 'Could not verify these X credentials');
  }
  const cleanTwid = decodeURIComponent(twid).replace(/^u=/, '').trim();
  const xUserId = verified.id || cleanTwid;
  const xUsername = verified.username;

  const user = await prisma.user.upsert({
    where: { xUserId },
    update: { xUsername, name: `@${xUsername}` },
    create: {
      id: randomUUID(),
      name: `@${xUsername}`,
      email: `${xUsername.toLowerCase()}_${xUserId}@x.justbot.local`,
      xUserId,
      xUsername,
      hasCustomEmail: false,
    },
  });

  await ensureTenantInitialized(user.id);
  await saveApiKey(raw, user.id);
  await q(
    `INSERT INTO account(id, user_id, status, username, checked_at, detail)
     VALUES (true, $1, 'connected', $2, now(), NULL)
     ON CONFLICT (user_id) DO UPDATE SET status='connected', username=$2, checked_at=now(), detail=NULL`,
    [user.id, xUsername],
  );
  return user;
}

/** 1-Click Sign In with X credentials (from JustBot Chrome Extension or manual cookie paste). */
export const POST = guard(async (req) => {
  const b = Body.parse(await req.json());
  const user = await findOrCreateXUser(b.authToken, b.ct0, b.twid);
  await createUserSession(user.id);
  return { ok: true, username: user.xUsername, userId: user.id };
}, { public: true });
