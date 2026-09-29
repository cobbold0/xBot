import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

import { q } from '../../src/core/db/pool';
import { resetEnvCache } from '../../src/core/config';
import { notify, notifyOnce, pushConfigured } from '../../src/core/push';
import { getDashboardData } from '../../src/web/data';
import { HAS_DB, freshDb, teardown } from '../helpers';

describe.skipIf(!HAS_DB)('push notifications & dashboard data', () => {
  beforeEach(async () => {
    await freshDb();
    Object.assign(process.env, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    resetEnvCache();
    sendNotification.mockReset();
    await q(`INSERT INTO push_subscriptions(endpoint,p256dh,auth) VALUES ('https://push.example/a','k','a'),('https://push.example/b','k','a')`);
  });
  afterAll(async () => { delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; resetEnvCache(); await teardown(); });

  it('sends to all subscriptions', async () => {
    sendNotification.mockResolvedValue({});
    expect(await notify({ title: 't', body: 'b' })).toBe(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({ title: 't', url: '/' });
  });
  it('removes expired subscriptions (410) and survives other failures', async () => {
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('/a')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      throw Object.assign(new Error('boom'), { statusCode: 500 });
    });
    expect(await notify({ title: 't', body: 'b' })).toBe(0);
    expect((await q('SELECT endpoint FROM push_subscriptions')).rows).toEqual([{ endpoint: 'https://push.example/b' }]);
  });
  it('does nothing when VAPID keys are missing', async () => {
    delete process.env.VAPID_PRIVATE_KEY; resetEnvCache();
    expect(pushConfigured()).toBe(false);
    expect(await notify({ title: 't', body: 'b' })).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it('notifyOnce sends a given key only once', async () => {
    sendNotification.mockResolvedValue({});
    expect(await notifyOnce('budget:daily:2026-01-01', { title: 't', body: 'b' })).toBe(true);
    expect(await notifyOnce('budget:daily:2026-01-01', { title: 't', body: 'b' })).toBe(false);
    expect(sendNotification).toHaveBeenCalledTimes(2); // one send per device, once
  });
  it('dashboard data query works on real rows (series, ids as numbers)', async () => {
    await q(`INSERT INTO ai_usage(purpose,model,input_tokens,output_tokens,cost_usd) VALUES ('analyze','m',100,50,0.01)`);
    await q(`INSERT INTO actions(type,status) VALUES ('like','succeeded')`);
    await q(`INSERT INTO drafts(kind,text,text_hash) VALUES ('post','x','h')`);
    const d = await getDashboardData();
    expect(typeof d.drafts[0].id).toBe('number');
    expect(d.series.cost[0].cost).toBeCloseTo(0.01);
    expect(d.series.actions[0]).toMatchObject({ like: 1, post: 0 });
    expect(d.series.byPurpose).toEqual([{ name: 'analyze', value: 0.01 }]);
    expect(d.push).toEqual({ configured: true, devices: 2 });
  });
});
