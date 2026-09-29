import { z } from 'zod';

const bool = (d: boolean) => z.string().optional().transform((v) => (v === undefined || v === '' ? d : v === 'true' || v === '1'));
const num = (d: number) => z.string().optional().transform((v) => (v === undefined || v === '' ? d : Number(v))).pipe(z.number().finite());

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  ANTHROPIC_PRICE_INPUT_PER_MTOK: num(3),
  ANTHROPIC_PRICE_OUTPUT_PER_MTOK: num(15),
  X_API_KEY: z.string().optional(),
  DASHBOARD_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  TZ: z.string().default('UTC'),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  // Seeds for first-run settings only
  DRY_RUN: bool(true),
  AUTO_PUBLISH: bool(false),
  AUTO_LIKE: bool(false),
  AUTO_REPOST: bool(false),
  DAILY_BUDGET_USD: num(2),
  MONTHLY_BUDGET_USD: num(30),
  MAX_POSTS_PER_DAY: num(3),
  MAX_LIKES_PER_DAY: num(20),
  MAX_REPOSTS_PER_DAY: num(5),
  MAX_REPLIES_PER_DAY: num(5),
  MAX_POSTS_PROCESSED_PER_RUN: num(15),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    const r = EnvSchema.safeParse(process.env);
    if (!r.success) throw new Error('Invalid environment: ' + r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; '));
    cached = r.data;
  }
  return cached;
}
export function resetEnvCache() { cached = undefined; }
