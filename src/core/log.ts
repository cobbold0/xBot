const SECRET_KEYS = /(api[_-]?key|auth_token|ct0|twid|cookie|password|secret|token|authorization)/i;
const VALUE_PATTERNS: RegExp[] = [/sk-ant-[A-Za-z0-9_-]+/g, /(auth_token|ct0|twid)=[^;\s"']+/gi];

export function redact(input: unknown): string {
  let s = typeof input === 'string' ? input : input instanceof Error ? input.message : safeJson(input);
  for (const p of VALUE_PATTERNS) s = s.replace(p, (m) => (m.includes('=') ? m.split('=')[0] + '=[redacted]' : '[redacted]'));
  for (const v of [process.env.ANTHROPIC_API_KEY, process.env.X_API_KEY, process.env.DASHBOARD_PASSWORD, process.env.SESSION_SECRET]) {
    if (v && v.length >= 6) s = s.split(v).join('[redacted]');
  }
  return s;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, (k, val) => (k && SECRET_KEYS.test(k) ? '[redacted]' : val));
  } catch {
    return String(v);
  }
}

export const log = {
  info: (msg: string, ctx?: unknown) => console.log(`[info] ${redact(msg)}${ctx ? ' ' + redact(ctx) : ''}`),
  warn: (msg: string, ctx?: unknown) => console.warn(`[warn] ${redact(msg)}${ctx ? ' ' + redact(ctx) : ''}`),
  error: (msg: string, ctx?: unknown) => console.error(`[error] ${redact(msg)}${ctx ? ' ' + redact(ctx) : ''}`),
};
