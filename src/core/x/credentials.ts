import { q } from '../db/pool';
import { decryptSecret, encryptSecret } from '../secrets';
import { DEFAULT_TENANT_ID, getTenantId, settingKey } from '../tenant';
import { normalizeApiKey } from './rettiwt';

const BASE_KEY = 'x_credentials';

/** Cookie string stored (encrypted) via the dashboard for the current tenant (with fallback to legacy global key), or null. */
export async function getStoredApiKey(userId = getTenantId()): Promise<string | null> {
  const k = settingKey(BASE_KEY, userId);
  let { rows } = await q<{ value: { enc?: string } }>('SELECT value FROM settings WHERE key = $1', [k]);
  if (!rows[0]?.value?.enc && userId !== DEFAULT_TENANT_ID) {
    const fallback = await q<{ value: { enc?: string } }>('SELECT value FROM settings WHERE key = $1', [BASE_KEY]);
    if (fallback.rows[0]?.value?.enc) {
      rows = fallback.rows;
      // Copy to tenant key for future lookups
      await q(
        `INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [k, JSON.stringify(fallback.rows[0].value)],
      ).catch(() => {});
    }
  }
  const enc = rows[0]?.value?.enc;
  if (!enc) return null;
  try { return decryptSecret(enc); } catch { return null; }
}

/** Validates/normalizes the input, then stores it encrypted for the current tenant. Returns the normalized (base64) key. */
export async function saveApiKey(input: string, userId = getTenantId()): Promise<string> {
  const normalized = normalizeApiKey(input);
  const payload = JSON.stringify({ enc: encryptSecret(normalized) });
  await q(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`, [settingKey(BASE_KEY, userId), payload]);
  if (userId !== DEFAULT_TENANT_ID) {
    await q(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`, [BASE_KEY, payload]);
  }
  return normalized;
}

export async function clearApiKey(userId = getTenantId()) {
  await q('DELETE FROM settings WHERE key = $1', [settingKey(BASE_KEY, userId)]);
}

export async function credentialInfo(userId = getTenantId()): Promise<{ source: 'dashboard' | 'env' | 'none'; updatedAt: Date | null }> {
  const { rows } = await q<{ updated_at: Date }>('SELECT updated_at FROM settings WHERE key IN ($1, $2) ORDER BY updated_at DESC LIMIT 1', [settingKey(BASE_KEY, userId), BASE_KEY]);
  if (rows[0]) return { source: 'dashboard', updatedAt: rows[0].updated_at };
  if (process.env.X_API_KEY) return { source: 'env', updatedAt: null };
  return { source: 'none', updatedAt: null };
}
