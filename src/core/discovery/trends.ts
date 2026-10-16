import { createHash } from 'node:crypto';
import type { XPost } from '../x/types';

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function stableId(prefix: string, raw: string): string {
  return `${prefix}_${createHash('sha1').update(raw).digest('hex').slice(0, 16)}`;
}

/** Scrapes Google News RSS for a query (topic, keyword, or person). Free, no API key required. */
export async function fetchGoogleNews(query: string, count = 8): Promise<XPost[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'JustBot/1.0 (+https://localhost)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: XPost[] = [];
  for (const item of items.slice(0, count)) {
    const title = decodeXml(/<title>([\s\S]*?)<\/title>/i.exec(item)?.[1] ?? '');
    const source = decodeXml(/<source[^>]*>([\s\S]*?)<\/source>/i.exec(item)?.[1] ?? 'GoogleNews').replace(/[^\w]/g, '') || 'GoogleNews';
    const pubDate = decodeXml(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1] ?? '');
    const guid = decodeXml(/<guid[^>]*>([\s\S]*?)<\/guid>/i.exec(item)?.[1] ?? title);
    if (!title) continue;
    out.push({
      id: stableId('gnews', guid),
      text: `[BREAKING NEWS] ${title}`,
      authorId: source,
      authorHandle: source,
      createdAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      likes: 100,
      reposts: 40,
      replies: 0,
      isReply: false,
      isRepost: false,
    });
  }
  return out;
}

/** Scrapes hot/trending Reddit discussions for a query (topic, keyword, or person). Free, no API key required. */
export async function fetchRedditTrends(query: string, count = 8): Promise<XPost[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=hot&t=week&limit=${count}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'web:justbot:v1.0 (by /u/justbot)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  const json: any = await res.json();
  const children: any[] = json?.data?.children ?? [];
  const out: XPost[] = [];
  for (const c of children.slice(0, count)) {
    const d = c?.data;
    if (!d?.title) continue;
    const body = typeof d.selftext === 'string' && d.selftext.trim() ? ` — ${d.selftext.replace(/\s+/g, ' ').trim().slice(0, 240)}` : '';
    out.push({
      id: `reddit_${String(d.id || stableId('rd', d.title)).replace(/[^\w-]/g, '')}`,
      text: `[REDDIT TREND r/${d.subreddit ?? 'all'}] ${d.title}${body}`,
      authorId: String(d.author ?? 'reddit'),
      authorHandle: String(d.subreddit ?? 'reddit').replace(/[^\w]/g, ''),
      createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
      likes: Number(d.ups ?? 0),
      reposts: Number(d.num_comments ?? 0),
      replies: Number(d.num_comments ?? 0),
      isReply: false,
      isRepost: false,
    });
  }
  return out;
}
