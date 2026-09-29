import { guard } from '@/web/api';
import { env } from '@/core/config';
export const dynamic = 'force-dynamic';
export const GET = guard(async () => ({ publicKey: env().VAPID_PUBLIC_KEY && env().VAPID_PRIVATE_KEY ? env().VAPID_PUBLIC_KEY : null }));
