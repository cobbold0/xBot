import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/web/auth';
import { getDashboardData } from '@/web/data';
import { Shell } from './shell';

export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthed())) redirect('/login');
  const initial = JSON.parse(JSON.stringify(await getDashboardData()));
  return <Shell initial={initial}>{children}</Shell>;
}
