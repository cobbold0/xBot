import { q } from '../db/pool';
import { decryptSecret, encryptSecret } from '../secrets';
import { DEFAULT_TENANT_ID, getTenantId, settingKey } from '../tenant';
import { normalizeApiKey } from './rettiwt';

const BASE_KEY = 'x_credentials';

/** Cookie string stored (encrypted) via the dashboard for the current tenant, or null. */
export async function getStoredApiKey(userId = getTenantId()): Promise<string | null> {
  const { rows } = await q<{ value: { enc?: string } }>('SELECT value FROM settings WHERE key = $1', [settingKey(BASE_KEY, userId)]);
  const enc = rows[0]?.value?.enc;
  if (!enc) return null;
  try { return decryptSecret(enc); } catch { return null; }
}

/** Validates/normalizes the input, then stores it encrypted for the current tenant. Returns the normalized (base64) key. */
export async function saveApiKey(input: string, userId = getTenantId()): Promise<string> {
  const normalized = normalizeApiKey(input);
  const payload = JSON.stringify({ enc: encryptSecret(normalized) });
  await q(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`, [settingKey(BASE_KEY, userId), payload]);
  return normalized;
}

export async function clearApiKey(userId = getTenantId()) {
  await q('DELETE FROM settings WHERE key = $1', [settingKey(BASE_KEY, userId)]);
}

export async function credentialInfo(userId = getTenantId()): Promise<{ source: 'dashboard' | 'env' | 'none'; updatedAt: Date | null }> {
  const { rows } = await q<{ updated_at: Date }>('SELECT updated_at FROM settings WHERE key = $1', [settingKey(BASE_KEY, userId)]);
  if (rows[0]) return { source: 'dashboard', updatedAt: rows[0].updated_at };
  if (userId === DEFAULT_TENANT_ID && process.env.X_API_KEY) return { source: 'env', updatedAt: null };
  return { source: 'none', updatedAt: null };
}
