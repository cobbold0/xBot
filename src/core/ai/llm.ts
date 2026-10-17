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

const LEGACY_GEMINI_MODELS: Record<string, string> = {
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'models/gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
};

function normalizeGeminiModel(raw: string): string {
  const clean = raw.replace(/^models\//, '').trim();
  if (LEGACY_GEMINI_MODELS[clean]) return LEGACY_GEMINI_MODELS[clean];
  if (/^\d/.test(clean) && !clean.startsWith('gemini-')) return `gemini-${clean}`;
  return clean || 'gemini-3.5-flash-lite';
}

export class GeminiLlm implements LlmClient {
  private model: string;
  constructor(private apiKey = env().GEMINI_API_KEY, model = env().GEMINI_MODEL) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    this.model = normalizeGeminiModel(model);
  }

  private async discoverFlashModels(): Promise<string[]> {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey!)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return [];
      const data: any = await r.json();
      const models: string[] = (data.models ?? [])
        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
        .filter((name: string) => name.startsWith('gemini-') && name.includes('flash') && !name.includes('tts') && !name.includes('image'));
      const lite = models.filter((m) => m.includes('flash-lite')).sort().reverse();
      const regular = models.filter((m) => !m.includes('flash-lite')).sort().reverse();
      return [...new Set([...lite, ...regular])];
    } catch {
      return [];
    }
  }

  async complete({ system, user, maxTokens }: { system: string; user: string; maxTokens: number }): Promise<LlmResult> {
    const callModel = async (m: string) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(this.apiKey!)}`;
      return fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    };

    let activeModel = this.model;
    let res = await callModel(activeModel);

    // Handle 404 (retired or invalid model name) by switching to Google's suggested model or discovering available Flash models
    if (res.status === 404) {
      const errText = await res.text().catch(() => '');
      const suggested = errText.match(/use models\/([a-zA-Z0-9._-]+)/)?.[1] ?? (await this.discoverFlashModels())[0];
      if (suggested && suggested !== activeModel) {
        this.model = suggested;
        activeModel = suggested;
        res = await callModel(activeModel);
      } else {
        throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
      }
    }

    // Handle 503 (high demand spike) / 429 (model quota exceeded) with backoff and fallback across available Flash models
    if (res.status === 503 || res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await callModel(activeModel);
      if (res.status === 503 || res.status === 429) {
        const fallbacks = (await this.discoverFlashModels()).filter((m) => m !== activeModel);
        for (const fb of fallbacks.slice(0, 3)) {
          const fbRes = await callModel(fb);
          if (fbRes.ok) {
            activeModel = fb;
            res = fbRes;
            break;
          }
        }
      }
    }

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
      model: activeModel,
    };
  }
}

export class OpenAiLlm implements LlmClient {
  constructor(
    private apiKey = env().OPENAI_API_KEY,
    private model = env().OPENAI_MODEL || 'gpt-4o-mini',
  ) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  }

  async complete({ system, user, maxTokens }: { system: string; user: string; maxTokens: number }): Promise<LlmResult> {
    const callModel = async () => {
      return fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    };

    let res = await callModel();

    // 429 (rate limit / quota spike) or 503 retry with backoff once
    if (res.status === 429 || res.status === 503 || res.status === 500) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await callModel();
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? {};
    return {
      text,
      inputTokens: Number(usage.prompt_tokens ?? 0),
      outputTokens: Number(usage.completion_tokens ?? 0),
      model: data.model ?? this.model,
    };
  }
}

export class FallbackLlm implements LlmClient {
  constructor(public readonly providers: { name: string; client: LlmClient }[]) {
    if (!providers.length) throw new Error('No LLM providers configured');
  }

  async complete(args: { system: string; user: string; maxTokens: number }): Promise<LlmResult> {
    let lastError: any = null;
    for (let i = 0; i < this.providers.length; i++) {
      const { name, client } = this.providers[i];
      try {
        return await client.complete(args);
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        if (i < this.providers.length - 1) {
          const next = this.providers[i + 1].name;
          console.warn(`[LLM] Provider ${name} error (${msg.slice(0, 120)}). Switching to fallback provider ${next}...`);
          continue;
        }
      }
    }
    throw lastError;
  }
}

export function createLlm(e = env()): LlmClient {
  const gemini = e.GEMINI_API_KEY ? { name: 'Gemini', client: new GeminiLlm(e.GEMINI_API_KEY, e.GEMINI_MODEL) } : null;
  const openai = e.OPENAI_API_KEY ? { name: 'ChatGPT/OpenAI', client: new OpenAiLlm(e.OPENAI_API_KEY, e.OPENAI_MODEL) } : null;
  const anthropic = e.ANTHROPIC_API_KEY ? { name: 'Anthropic', client: new AnthropicLlm(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL) } : null;

  const providers: { name: string; client: LlmClient }[] = [];

  if (e.LLM_PROVIDER === 'openai') {
    if (openai) providers.push(openai);
    if (gemini) providers.push(gemini);
    if (anthropic) providers.push(anthropic);
  } else if (e.LLM_PROVIDER === 'anthropic') {
    if (anthropic) providers.push(anthropic);
    if (gemini) providers.push(gemini);
    if (openai) providers.push(openai);
  } else {
    // Default: Gemini first, ChatGPT / OpenAI as automatic fallback
    if (gemini) providers.push(gemini);
    if (openai) providers.push(openai);
    if (anthropic) providers.push(anthropic);
  }

  if (providers.length === 0) {
    return new GeminiLlm(e.GEMINI_API_KEY, e.GEMINI_MODEL);
  }

  if (providers.length === 1) {
    return providers[0].client;
  }

  return new FallbackLlm(providers);
}
