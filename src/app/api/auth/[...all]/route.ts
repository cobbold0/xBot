import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/web/better-auth';

export const dynamic = 'force-dynamic';
export const { GET, POST } = toNextJsHandler(auth.handler);
