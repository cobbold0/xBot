import type { DashboardData } from './data';

type Jsonify<T> = T extends Date ? string : T extends (infer U)[] ? Jsonify<U>[] : T extends object ? { [K in keyof T]: Jsonify<T[K]> } : T;
export type Dash = Jsonify<DashboardData>;

export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : method === 'GET' ? undefined : { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : method === 'GET' ? undefined : '{}' });
  if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.issues ? ': ' + j.issues.map((i: any) => `${i.path} ${i.message}`).join(', ') : ''}` : 'Request failed');
  return j as T;
}

export const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function relTime(d?: string | null): string {
  if (!d) return '—';
  const s = Math.round((new Date(d).getTime() - Date.now()) / 1000);
  const a = Math.abs(s);
  const [n, u] = a < 60 ? [a, 's'] : a < 3600 ? [Math.round(a / 60), 'm'] : a < 86400 ? [Math.round(a / 3600), 'h'] : [Math.round(a / 86400), 'd'];
  return s >= 0 ? `in ${n}${u}` : `${n}${u} ago`;
}
