import { closePool, getPool, q } from '../src/core/db/pool';
import { migrate } from '../src/core/db/migrate';
import { resetEnvCache } from '../src/core/config';
import { defaultSettings, saveSettings, type Settings } from '../src/core/settings';
import type { LlmClient } from '../src/core/ai/llm';

export const HAS_DB = !!process.env.TEST_DATABASE_URL;

export async function freshDb() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.SESSION_SECRET = 'x'.repeat(40);
  process.env.DASHBOARD_PASSWORD = 'pw';
  resetEnvCache();
  await getPool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
}
export const teardown = () => closePool();

export async function withSettings(patch: Partial<Settings> = {}) {
  return saveSettings({ ...defaultSettings(), minActionSpacingSec: 5, ...patch });
}
export const setSpacingZero = () => q(`UPDATE actions SET created_at = created_at - interval '1 hour'`);

/** Scripted LLM: returns queued responses in order and counts calls. */
export class MockLlm implements LlmClient {
  calls: { system: string; user: string }[] = [];
  constructor(public responses: (string | ((user: string) => string))[], public tokens = { i: 1000, o: 500 }) {}
  async complete(a: { system: string; user: string; maxTokens: number }) {
    this.calls.push({ system: a.system, user: a.user });
    const r = this.responses.shift();
    if (r === undefined) throw new Error('MockLlm exhausted');
    return { text: typeof r === 'function' ? r(a.user) : r, inputTokens: this.tokens.i, outputTokens: this.tokens.o, model: 'mock' };
  }
}
export const analysisJson = (items: Record<string, Partial<{ relevance: number; quality: number; suggestedAction: string; injectionSuspected: boolean; engagementSuitable: boolean }>>) =>
  JSON.stringify({ results: Object.entries(items).map(([id, o]) => ({ id, relevance: 8, quality: 8, topic: 't', engagementSuitable: true, suggestedAction: 'none', injectionSuspected: false, reason: 'r', ...o })) });
