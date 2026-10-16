import { z } from 'zod';
import { env } from './config';
import { q } from './db/pool';
import { getTenantId, settingKey } from './tenant';

const list = z.array(z.string().trim().min(1).max(200)).max(50);

export const SettingsSchema = z.object({
  dryRun: z.boolean(),
  autoPublish: z.boolean(),
  autoLike: z.boolean(),
  autoRepost: z.boolean(),
  searchTerms: list,
  accounts: list,
  topics: list,
  voice: z.string().max(2000),
  pollIntervalMin: z.number().int().min(5).max(1440),
  generateIntervalMin: z.number().int().min(15).max(10080),
  maxPostChars: z.number().int().min(20).max(280),
  minRelevance: z.number().int().min(1).max(10),
  minQuality: z.number().int().min(1).max(10),
  similarityThreshold: z.number().min(0.3).max(1),
  maxPostsPerDay: z.number().int().min(0).max(50),
  maxLikesPerDay: z.number().int().min(0).max(200),
  maxRepostsPerDay: z.number().int().min(0).max(50),
  maxRepliesPerDay: z.number().int().min(0).max(50),
  minActionSpacingSec: z.number().int().min(5).max(3600),
  maxPostsProcessedPerRun: z.number().int().min(1).max(100),
  dailyBudgetUsd: z.number().min(0),
  monthlyBudgetUsd: z.number().min(0),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  const e = env();
  return {
    dryRun: e.DRY_RUN, autoPublish: e.AUTO_PUBLISH, autoLike: e.AUTO_LIKE, autoRepost: e.AUTO_REPOST,
    searchTerms: [], accounts: [], topics: [],
    voice: 'Concise, thoughtful, specific. No hashtags spam, no emojis unless natural. Never make unverifiable claims.',
    pollIntervalMin: 30, generateIntervalMin: 240, maxPostChars: 280, minRelevance: 6, minQuality: 6, similarityThreshold: 0.8,
    maxPostsPerDay: e.MAX_POSTS_PER_DAY, maxLikesPerDay: e.MAX_LIKES_PER_DAY, maxRepostsPerDay: e.MAX_REPOSTS_PER_DAY,
    maxRepliesPerDay: e.MAX_REPLIES_PER_DAY, minActionSpacingSec: 60, maxPostsProcessedPerRun: e.MAX_POSTS_PROCESSED_PER_RUN,
    dailyBudgetUsd: e.DAILY_BUDGET_USD, monthlyBudgetUsd: e.MONTHLY_BUDGET_USD,
  };
}

export async function getSettings(userId = getTenantId()): Promise<Settings> {
  const k = settingKey('app', userId);
  let { rows } = await q('SELECT value FROM settings WHERE key = $1', [k]);
  if (!rows[0] && k !== 'app') {
    rows = (await q('SELECT value FROM settings WHERE key = $1', ['app'])).rows;
  }
  const parsed = SettingsSchema.safeParse({ ...defaultSettings(), ...(rows[0]?.value ?? {}) });
  return parsed.success ? parsed.data : defaultSettings();
}

export async function saveSettings(input: unknown, userId = getTenantId()): Promise<Settings> {
  const s = SettingsSchema.parse(input);
  await q(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`, [settingKey('app', userId), JSON.stringify(s)]);
  return s;
}

export async function getControl(userId = getTenantId()) {
  const { rows } = await q<{ paused: boolean; emergency_stop: boolean }>('SELECT paused, emergency_stop FROM control WHERE user_id = $1', [userId]);
  if (!rows[0]) {
    await q('INSERT INTO control(id, user_id, paused, emergency_stop) VALUES (true, $1, false, false) ON CONFLICT (user_id) DO NOTHING', [userId]);
    return { paused: false, emergencyStop: false };
  }
  return { paused: rows[0].paused, emergencyStop: rows[0].emergency_stop };
}
export async function setControl(patch: { paused?: boolean; emergencyStop?: boolean }, userId = getTenantId()) {
  await q(
    `INSERT INTO control(id, user_id, paused, emergency_stop, updated_at)
     VALUES (true, $1, COALESCE($2, false), COALESCE($3, false), now())
     ON CONFLICT (user_id) DO UPDATE SET paused = COALESCE($2, control.paused), emergency_stop = COALESCE($3, control.emergency_stop), updated_at = now()`,
    [userId, patch.paused ?? null, patch.emergencyStop ?? null],
  );
}

export async function recordError(source: string, err: unknown, userId = getTenantId()) {
  const { redact } = await import('./log');
  await q('INSERT INTO errors(user_id, source, message) VALUES ($1, $2, $3)', [userId, source, redact(err).slice(0, 2000)]).catch(() => {});
}
