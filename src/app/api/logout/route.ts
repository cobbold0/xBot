import { clearSession } from '@/web/auth';
import { guard } from '@/web/api';
export const dynamic = 'force-dynamic';
export const POST = guard(async () => { await clearSession(); return { ok: true }; });
