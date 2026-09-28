import { z } from 'zod';

export const AnalysisSchema = z.object({
  relevance: z.number().int().min(1).max(10),
  quality: z.number().int().min(1).max(10),
  topic: z.string().max(80),
  engagementSuitable: z.boolean(),
  suggestedAction: z.enum(['none', 'like', 'repost', 'reply_draft']),
  injectionSuspected: z.boolean(),
  reason: z.string().max(300),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const AnalysisBatchSchema = z.object({
  results: z.array(AnalysisSchema.extend({ id: z.string() })),
});

export const GeneratedPostsSchema = z.object({
  posts: z.array(z.object({ text: z.string().min(1).max(1000), topic: z.string().max(80), rationale: z.string().max(300) })).max(10),
});

export const ReplySchema = z.object({ text: z.string().min(1).max(1000), rationale: z.string().max(300) });

/** Extracts the first JSON object from model text (handles code fences / surrounding prose) and validates it. */
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object found' };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  const r = schema.safeParse(raw);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
