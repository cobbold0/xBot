import { createServer } from 'node:http';
import { env } from '../core/config';
import { migrate } from '../core/db/migrate';
import { closePool } from '../core/db/pool';
import { buildJobs } from '../core/jobs';
import { log } from '../core/log';
import { Scheduler } from '../core/scheduler/scheduler';
import { createLlm } from '../core/ai/llm';
import { createXClient } from '../core/x/rettiwt';
import { getStoredApiKey } from '../core/x/credentials';
import { XError, type XClient } from '../core/x/types';
import type { LlmClient } from '../core/ai/llm';
import { DEFAULT_TENANT_ID, getTenantId, listTenantIds } from '../core/tenant';

const TICK_MS = 15_000;

async function main() {
  env();
  await migrate();
  const xClients = new Map<string, { key: string; client: XClient }>();
  let llm: LlmClient | undefined;

  /** Syncs per-tenant X credentials stored in the dashboard (or fallback X_API_KEY). */
  const syncX = async () => {
    const tenants = await listTenantIds();
    for (const userId of tenants) {
      const key = (await getStoredApiKey(userId)) ?? (userId === DEFAULT_TENANT_ID || tenants.length === 1 ? process.env.X_API_KEY ?? null : null);
      const prev = xClients.get(userId);
      if (!key) {
        xClients.delete(userId);
        continue;
      }
      if (prev?.key === key) continue;
      try {
        xClients.set(userId, { key, client: createXClient(key) });
      } catch (e) {
        xClients.delete(userId);
        log.warn(`X credentials are invalid for tenant ${userId}`, e);
      }
    }
  };

  const sched = new Scheduler(buildJobs({
    x: () => {
      const userId = getTenantId();
      const entry = xClients.get(userId);
      if (!entry) throw new XError('auth', 'No valid X credentials configured');
      return entry.client;
    },
    llm: () => (llm ??= createLlm()),
  }));
  await sched.init();

  const port = Number(process.env.WORKER_PORT ?? 3001);
  const server = createServer((req, res) => {
    const ok = Date.now() - sched.lastTickAt < TICK_MS * 8;
    res.writeHead(req.url === '/healthz' && ok ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok }));
  }).listen(port);

  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  log.info(`worker ${sched.id} started`);

  while (!stopping) {
    try {
      await syncX();
      const ran = await sched.tick();
      if (ran.length) log.info(`ran jobs: ${ran.join(', ')}`);
    } catch (e) {
      log.error('tick failed', e);
    }
    for (let i = 0; i < TICK_MS / 500 && !stopping; i++) await new Promise((r) => setTimeout(r, 500));
  }
  server.close();
  await closePool();
  log.info('worker stopped');
}

main().catch((e) => { log.error('fatal', e); process.exit(1); });
