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

export class GeminiLlm implements LlmClient {
  constructor(private apiKey = env().GEMINI_API_KEY, private model = env().GEMINI_MODEL) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  }
  async complete({ system, user, maxTokens }: { system: string; user: string; maxTokens: number }): Promise<LlmResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey!)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
    const usage = data.usageMetadata ?? {};
    return {
      text,
      inputTokens: Number(usage.promptTokenCount ?? 0),
      outputTokens: Number(usage.candidatesTokenCount ?? 0),
      model: this.model,
    };
  }
}

export function createLlm(e = env()): LlmClient {
  if (e.GEMINI_API_KEY) return new GeminiLlm(e.GEMINI_API_KEY, e.GEMINI_MODEL);
  if (e.ANTHROPIC_API_KEY) return new AnthropicLlm(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL);
  return new GeminiLlm(e.GEMINI_API_KEY, e.GEMINI_MODEL);
}
