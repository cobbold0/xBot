import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { isAuthed } from './auth';
import { log } from '../core/log';

type Handler = (req: Request) => Promise<Response | object>;

/** Auth + validation + safe error handling: internal errors never reach the browser. */
export function guard(h: Handler, opts: { public?: boolean } = {}) {
  return async (req: Request) => {
    try {
      if (!opts.public && !(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      if (req.method !== 'GET' && !(req.headers.get('content-type') ?? '').includes('application/json')) return NextResponse.json({ error: 'json required' }, { status: 415 });
      const r = await h(req);
      return r instanceof Response ? r : NextResponse.json(r);
    } catch (e) {
      if (e instanceof ZodError) return NextResponse.json({ error: 'invalid input', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      log.error('api error', e);
      return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
  };
}
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
