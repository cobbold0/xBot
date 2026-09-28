import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config';

export interface LlmResult { text: string; inputTokens: number; outputTokens: number; model: string }
export interface LlmClient {
  complete(args: { system: string; user: string; maxTokens: number }): Promise<LlmResult>;
}

export class AnthropicLlm implements LlmClient {
  private c: Anthropic;
  constructor(apiKey = env().ANTHROPIC_API_KEY, private model = env().ANTHROPIC_MODEL) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.c = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }
  async complete({ system, user, maxTokens }: { system: string; user: string; maxTokens: number }): Promise<LlmResult> {
    const r = await this.c.messages.create({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
    const text = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { text, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens, model: this.model };
  }
}
