import type { z } from 'zod';
import type { LlmClient } from './llm';
import { assertBudget, recordUsage } from './cost';
import { AnalysisBatchSchema, GeneratedPostsSchema, ReplySchema, parseModelJson, type Analysis } from './schemas';
import { analysisPrompt, generationPrompt, replyPrompt } from './prompts';
import type { Settings } from '../settings';
import type { XPost } from '../x/types';

export class AiParseError extends Error {
  constructor(msg: string) { super(msg); this.name = 'AiParseError'; }
}

export class AiAgent {
  constructor(private llm: LlmClient, private settings: Settings) {}

  /** One budget check + LLM call + usage record + validated parse. One repair retry on malformed output. */
  private async run<T>(purpose: string, p: { system: string; user: string }, schema: z.ZodType<T>, maxTokens: number): Promise<T> {
    let lastErr = 'unknown';
    for (let attempt = 0; attempt < 2; attempt++) {
      await assertBudget(this.settings);
      const user = attempt === 0 ? p.user : `${p.user}\n\n(Your previous reply was invalid: ${lastErr}. Reply with ONLY one valid JSON object matching the schema.)`;
      const r = await this.llm.complete({ system: p.system, user, maxTokens });
      await recordUsage(purpose, r.model, r.inputTokens, r.outputTokens);
      const parsed = parseModelJson(r.text, schema);
      if (parsed.ok) return parsed.data;
      lastErr = parsed.error;
    }
    throw new AiParseError(`Model output failed validation: ${lastErr}`);
  }

  /** Returns analyses keyed by post id. Missing/unknown ids are dropped so a bad response cannot invent posts. */
  async analyze(posts: XPost[]): Promise<Map<string, Analysis>> {
    const out = new Map<string, Analysis>();
    if (!posts.length) return out;
    const data = await this.run('analyze', analysisPrompt(posts, this.settings), AnalysisBatchSchema, 300 * posts.length + 200);
    const ids = new Set(posts.map((p) => p.id));
    for (const { id, ...a } of data.results) if (ids.has(id) && !out.has(id)) out.set(id, a);
    return out;
  }

  async generatePosts(count: number, recent: string[], inspiration: XPost[]) {
    const data = await this.run('generate', generationPrompt(this.settings, recent, count, inspiration), GeneratedPostsSchema, 200 * count + 300);
    return data.posts.slice(0, count);
  }

  async draftReply(post: XPost) {
    return this.run('reply', replyPrompt(post, this.settings), ReplySchema, 400);
  }
}
