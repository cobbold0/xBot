import { q } from '../db/pool';
import { decryptSecret, encryptSecret } from '../secrets';
import { normalizeApiKey } from './rettiwt';

const KEY = 'x_credentials';

/** Cookie string stored (encrypted) via the dashboard, or null. Undecryptable data is treated as absent. */
export async function getStoredApiKey(): Promise<string | null> {
  const { rows } = await q<{ value: { enc?: string } }>('SELECT value FROM settings WHERE key = $1', [KEY]);
  const enc = rows[0]?.value?.enc;
  if (!enc) return null;
  try { return decryptSecret(enc); } catch { return null; }
}

/** Validates/normalizes the input, then stores it encrypted. Returns the normalized (base64) key. */
export async function saveApiKey(input: string): Promise<string> {
  const normalized = normalizeApiKey(input);
  await q(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`, [KEY, JSON.stringify({ enc: encryptSecret(normalized) })]);
  return normalized;
}

export async function clearApiKey() {
  await q('DELETE FROM settings WHERE key = $1', [KEY]);
}

export async function credentialInfo(): Promise<{ source: 'dashboard' | 'env' | 'none'; updatedAt: Date | null }> {
  const { rows } = await q<{ updated_at: Date }>('SELECT updated_at FROM settings WHERE key = $1', [KEY]);
  if (rows[0]) return { source: 'dashboard', updatedAt: rows[0].updated_at };
  return { source: process.env.X_API_KEY ? 'env' : 'none', updatedAt: null };
}
