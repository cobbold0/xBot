import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { q } from '@/core/db/pool';
import { clearApiKey, saveApiKey } from '@/core/x/credentials';
import { normalizeApiKey, RettiwtClient } from '@/core/x/rettiwt';
import { XError } from '@/core/x/types';

export const dynamic = 'force-dynamic';

const Body = z.object({ authToken: z.string().trim().min(10).max(300), ct0: z.string().trim().min(10).max(500), twid: z.string().trim().min(3).max(100) }).strict();

/** Verifies the cookies against X first; only valid credentials are stored (encrypted). Values are never returned. */
export const PUT = guard(async (req) => {
  const b = Body.parse(await req.json());
  const raw = `auth_token=${b.authToken};ct0=${b.ct0};twid=${b.twid};`;
  let user: { username: string };
  try {
    user = await new RettiwtClient(normalizeApiKey(raw)).verify();
  } catch (e) {
    throw new HttpError(400, e instanceof XError ? e.message : 'Could not verify these cookies with X');
  }
  await saveApiKey(raw);
  await q(`UPDATE account SET status='connected', username=$1, checked_at=now(), detail=NULL`, [user.username]);
  return { ok: true, username: user.username };
});

export const DELETE = guard(async () => { await clearApiKey(); return { ok: true }; });
