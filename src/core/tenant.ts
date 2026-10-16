import { AsyncLocalStorage } from 'node:async_hooks';
import { q } from './db/pool';

export const DEFAULT_TENANT_ID = 'default';

const tenantStorage = new AsyncLocalStorage<string>();

export function getTenantId(explicitUserId?: string): string {
  return explicitUserId || tenantStorage.getStore() || DEFAULT_TENANT_ID;
}

export function runWithTenant<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(userId || DEFAULT_TENANT_ID, fn);
}

export function settingKey(base: string, userId = getTenantId()): string {
  return userId === DEFAULT_TENANT_ID ? base : `${base}:${userId}`;
}

/** Returns all active tenant userIds (or ['default'] when running in single-tenant / test mode). */
export async function listTenantIds(): Promise<string[]> {
  try {
    // Clean up placeholder admin@justbot.local if real users exist
    await q(
      `DELETE FROM app_users WHERE email = 'admin@justbot.local' AND x_user_id IS NULL
       AND EXISTS (SELECT 1 FROM app_users WHERE email <> 'admin@justbot.local')`,
    ).catch(() => {});

    const { rows } = await q<{ id: string }>('SELECT id FROM app_users ORDER BY created_at ASC');
    if (rows.length > 0) return rows.map((r) => r.id);
  } catch {
    // fallback if app_users table not yet migrated
  }
  return [DEFAULT_TENANT_ID];
}

/**
 * Ensures the tenant has its own isolated control and account rows initialized.
 * Only the very first user (owner) adopts any legacy 'default' data; all subsequent sign-ups start with a clean slate.
 */
export async function ensureTenantInitialized(userId: string): Promise<void> {
  await q(
    `INSERT INTO account(id, user_id, status) VALUES (true, $1, 'unknown') ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  await q(
    `INSERT INTO control(id, user_id, paused, emergency_stop) VALUES (true, $1, false, false) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  if (userId === DEFAULT_TENANT_ID) return;

  const { rows: firstRows } = await q<{ id: string }>('SELECT id FROM app_users ORDER BY created_at ASC LIMIT 1');
  if (firstRows[0]?.id !== userId) return;

  // One-time migration of legacy global 'app' and 'x_credentials' to the primary owner account, then remove global keys
  const movedApp = await q(
    `INSERT INTO settings(key, value, updated_at)
     SELECT $1, value, updated_at FROM settings WHERE key = 'app'
     ON CONFLICT (key) DO NOTHING`,
    [settingKey('app', userId)],
  );
  if (movedApp.rowCount) {
    await q(`DELETE FROM settings WHERE key = 'app'`).catch(() => {});
  }

  const movedCreds = await q(
    `INSERT INTO settings(key, value, updated_at)
     SELECT $1, value, updated_at FROM settings WHERE key = 'x_credentials'
     ON CONFLICT (key) DO NOTHING`,
    [settingKey('x_credentials', userId)],
  );
  if (movedCreds.rowCount) {
    await q(`DELETE FROM settings WHERE key = 'x_credentials'`).catch(() => {});
  }

  // Adopt any remaining 'default' rows for the primary owner account only
  await q(`UPDATE posts SET user_id = $1 WHERE user_id = 'default'`, [userId]).catch(() => {});
  await q(`UPDATE drafts SET user_id = $1 WHERE user_id = 'default'`, [userId]).catch(() => {});
  await q(`UPDATE actions SET user_id = $1 WHERE user_id = 'default'`, [userId]).catch(() => {});
  await q(`UPDATE ai_usage SET user_id = $1 WHERE user_id = 'default'`, [userId]).catch(() => {});
  await q(`UPDATE errors SET user_id = $1 WHERE user_id = 'default'`, [userId]).catch(() => {});
  await q(`UPDATE push_subscriptions SET user_id = $1 WHERE user_id = 'default'`, [userId]).catch(() => {});
}
