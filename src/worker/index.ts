import { createServer } from 'node:http';
import { env } from '../core/config';
import { migrate } from '../core/db/migrate';
import { closePool } from '../core/db/pool';
import { buildJobs } from '../core/jobs';
import { log } from '../core/log';
import { Scheduler } from '../core/scheduler/scheduler';
import { AnthropicLlm } from '../core/ai/llm';
import { createXClient } from '../core/x/rettiwt';
import type { XClient } from '../core/x/types';
import type { LlmClient } from '../core/ai/llm';

const TICK_MS = 15_000;

async function main() {
  env();
  await migrate();
  let x: XClient | undefined;
  let llm: LlmClient | undefined;
  const sched = new Scheduler(buildJobs({ x: () => (x ??= createXClient()), llm: () => (llm ??= new AnthropicLlm()) }));
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
