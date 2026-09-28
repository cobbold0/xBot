import { XError, type SearchQuery, type XClient, type XPost } from './types';

/** In-memory X client for tests and local development without credentials. */
export class FakeXClient implements XClient {
  posts: XPost[] = [];
  written: { type: string; id?: string; text?: string; replyTo?: string }[] = [];
  failWith?: XError;
  private n = 1000;
  async verify() { if (this.failWith) throw this.failWith; return { username: 'fake', id: '1' }; }
  async search(q: SearchQuery) { if (this.failWith) throw this.failWith; return this.posts.slice(0, q.count); }
  async userPosts(_h: string, count: number) { if (this.failWith) throw this.failWith; return this.posts.slice(0, count); }
  async post(text: string, opts?: { replyTo?: string }) {
    if (this.failWith) throw this.failWith;
    const id = String(++this.n);
    this.written.push({ type: opts?.replyTo ? 'reply' : 'post', id, text, replyTo: opts?.replyTo });
    return id;
  }
  async like(id: string) { if (this.failWith) throw this.failWith; this.written.push({ type: 'like', id }); }
  async repost(id: string) { if (this.failWith) throw this.failWith; this.written.push({ type: 'repost', id }); }
}

export function fakePost(id: string, text: string, extra: Partial<XPost> = {}): XPost {
  return { id, text, authorId: 'u' + id, authorHandle: 'user' + id, createdAt: new Date().toISOString(), likes: 0, reposts: 0, replies: 0, isReply: false, isRepost: false, ...extra };
}
