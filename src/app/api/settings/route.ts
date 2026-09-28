import { guard } from '@/web/api';
import { getSettings, saveSettings } from '@/core/settings';
export const dynamic = 'force-dynamic';
export const GET = guard(async () => getSettings());
export const PUT = guard(async (req) => saveSettings(await req.json()));
