import { createServer } from 'node:http';
import { env } from '../core/config';
import { migrate } from '../core/db/migrate';
import { closePool } from '../core/db/pool';
import { buildJobs } from '../core/jobs';
import { log } from '../core/log';
import { Scheduler } from '../core/scheduler/scheduler';
import { AnthropicLlm } from '../core/ai/llm';
import { createXClient } from '../core/x/rettiwt';
import { getStoredApiKey } from '../core/x/credentials';
import { XError, type XClient } from '../core/x/types';
import type { LlmClient } from '../core/ai/llm';

const TICK_MS = 15_000;

async function main() {
  env();
  await migrate();
  let x: XClient | undefined;
  let xKey: string | null | undefined;
  let llm: LlmClient | undefined;
  /** Credentials saved in the dashboard take precedence over X_API_KEY; picked up without a restart. */
  const syncX = async () => {
    const key = (await getStoredApiKey()) ?? process.env.X_API_KEY ?? null;
    if (key === xKey) return;
    xKey = key;
    try { x = key ? createXClient(key) : undefined; } catch (e) { x = undefined; log.warn('X credentials are invalid', e); }
  };
  const sched = new Scheduler(buildJobs({
    x: () => { if (!x) throw new XError('auth', 'No valid X credentials configured'); return x; },
    llm: () => (llm ??= new AnthropicLlm()),
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
