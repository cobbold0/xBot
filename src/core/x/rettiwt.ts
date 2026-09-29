import { Rettiwt, TwitterError } from 'rettiwt-api';
import type { Tweet } from 'rettiwt-api';
import { XError, type SearchQuery, type XClient, type XPost } from './types';

function mapPost(t: Tweet): XPost {
  return {
    id: t.id,
    text: t.fullText ?? '',
    authorId: t.tweetBy?.id ?? '',
    authorHandle: t.tweetBy?.userName ?? '',
    createdAt: t.createdAt,
    lang: t.lang,
    likes: t.likeCount ?? 0,
    reposts: t.retweetCount ?? 0,
    replies: t.replyCount ?? 0,
    views: t.viewCount,
    isReply: !!t.replyTo,
    isRepost: !!t.retweetedTweet,
  };
}

export function mapError(e: unknown): XError {
  if (e instanceof XError) return e;
  const status = e instanceof TwitterError ? e.status : (e as any)?.response?.status ?? (e as any)?.status;
  const msg = e instanceof Error ? e.message : 'unknown X error';
  if (status === 401 || status === 403 || /auth|log ?in|cookie|credential/i.test(msg)) return new XError('auth', msg, status);
  if (status === 429) return new XError('rate_limit', msg, status);
  if (status && status >= 500) return new XError('temporary', msg, status);
  if (/ECONN|ETIMEDOUT|timeout|network/i.test(msg)) return new XError('temporary', msg, status);
  return new XError('unknown', msg, status);
}

export class RettiwtClient implements XClient {
  private r: Rettiwt;
  constructor(apiKey: string) {
    this.r = new Rettiwt({ apiKey, delay: 1500, maxRetries: 1, timeout: 30_000 });
  }
  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) { throw mapError(e); }
  }
  verify() {
    return this.wrap(async () => {
      const u = await this.r.user.details();
      if (!u) throw new XError('auth', 'Session cookie is not valid (no logged-in user returned)');
      return { username: u.userName, id: u.id };
    });
  }
  search(q: SearchQuery) {
    return this.wrap(async () => {
      const filter: Record<string, unknown> = { language: undefined, onlyOriginal: true };
      if (q.terms) filter.includeWords = q.terms.split(/\s+/).filter(Boolean);
      if (q.fromUser) filter.fromUsers = [q.fromUser.replace(/^@/, '')];
      if (q.sinceId) filter.sinceId = q.sinceId;
      const res = await this.r.tweet.search(filter, q.count);
      return res.list.map(mapPost);
    });
  }
  userPosts(handleOrId: string, count: number) {
    return this.wrap(async () => {
      const h = handleOrId.replace(/^@/, '');
      const id = /^\d+$/.test(h) ? h : (await this.r.user.details(h))?.id;
      if (!id) throw new XError('unknown', `User not found: ${h}`);
      const res = await this.r.user.timeline(id, count);
      return res.list.map(mapPost);
    });
  }
  post(text: string, opts?: { replyTo?: string }) {
    return this.wrap(async () => {
      const id = await this.r.tweet.post({ text, replyTo: opts?.replyTo });
      if (!id) throw new XError('unknown', 'X did not confirm the post (no id returned)');
      return id;
    });
  }
  like(id: string) {
    return this.wrap(async () => { if (!(await this.r.tweet.like(id))) throw new XError('unknown', 'X did not confirm the like'); });
  }
  repost(id: string) {
    return this.wrap(async () => { if (!(await this.r.tweet.retweet(id))) throw new XError('unknown', 'X did not confirm the repost'); });
  }
}

/**
 * Accepts the raw cookie string or its base64 form, tolerating stray quotes/whitespace, a missing trailing ";",
 * decoded twid ("u=123") and extra cookies. Returns the exact base64 form rettiwt-api requires.
 */
export function normalizeApiKey(input: string): string {
  let s = input.trim().replace(/^["']|["']$/g, '').trim();
  if (!/auth_token=/.test(s)) {
    try { const d = Buffer.from(s, 'base64').toString('utf8'); if (/auth_token=/.test(d)) s = d; } catch { /* keep as-is */ }
  }
  const pick = (name: string) => new RegExp(`(?:^|[;\\s])${name}=([^;\\s]+)`).exec(s)?.[1]?.replace(/^["']|["']$/g, '');
  const authToken = pick('auth_token'), ct0 = pick('ct0');
  const twidId = /(\d{5,})/.exec(decodeURIComponent(pick('twid') ?? ''))?.[1];
  if (!authToken || !ct0 || !twidId) {
    throw new XError('auth', `X_API_KEY is missing ${[!authToken && 'auth_token', !ct0 && 'ct0', !twidId && 'twid (expected u%3D<digits>)'].filter(Boolean).join(', ')}`);
  }
  return Buffer.from(`auth_token=${authToken};ct0=${ct0};twid=u%3D${twidId};`, 'utf8').toString('base64');
}

export function createXClient(): XClient {
  const key = process.env.X_API_KEY;
  if (!key) throw new XError('auth', 'X_API_KEY is not set');
  return new RettiwtClient(normalizeApiKey(key));
}
