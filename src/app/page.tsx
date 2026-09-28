import { redirect } from 'next/navigation';
import { isAuthed } from '@/web/auth';
import { getDashboardData } from '@/web/data';
import { Dashboard } from './dashboard';

export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!(await isAuthed())) redirect('/login');
  const data = JSON.parse(JSON.stringify(await getDashboardData()));
  return <Dashboard data={data} />;
}
