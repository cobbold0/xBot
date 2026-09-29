'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { notifications } from '@mantine/notifications';
import { api, type Dash } from '@/web/client';

interface Ctx { data: Dash; refresh: () => Promise<void>; act: <T>(p: Promise<T>, ok?: string) => Promise<T | undefined>; offline: boolean }
const DashCtx = createContext<Ctx | null>(null);
export const useDash = () => { const c = useContext(DashCtx); if (!c) throw new Error('useDash outside provider'); return c; };

export function DashProvider({ initial, children }: { initial: Dash; children: ReactNode }) {
  const [data, setData] = useState(initial);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try { setData(await api<Dash>('/api/status')); setOffline(false); } catch { setOffline(true); } finally { busy.current = false; }
  }, []);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onVis); };
  }, [refresh]);
  const act = useCallback(async <T,>(p: Promise<T>, ok?: string) => {
    try { const r = await p; if (ok) notifications.show({ message: ok, color: 'teal' }); await refresh(); return r; }
    catch (e: any) { notifications.show({ title: 'Failed', message: e.message, color: 'red' }); return undefined; }
  }, [refresh]);
  return <DashCtx.Provider value={{ data, refresh, act, offline }}>{children}</DashCtx.Provider>;
}
