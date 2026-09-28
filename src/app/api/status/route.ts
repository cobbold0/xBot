import { guard } from '@/web/api';
import { getDashboardData } from '@/web/data';
export const dynamic = 'force-dynamic';
export const GET = guard(async () => getDashboardData());
