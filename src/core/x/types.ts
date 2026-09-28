export interface XPost {
  id: string;
  text: string;
  authorId: string;
  authorHandle: string;
  createdAt: string;
  lang?: string;
  likes: number;
  reposts: number;
  replies: number;
  views?: number;
  isReply: boolean;
  isRepost: boolean;
}

export type XErrorKind = 'auth' | 'rate_limit' | 'temporary' | 'unsupported' | 'unknown';
export class XError extends Error {
  constructor(public kind: XErrorKind, message: string, public status?: number) {
    super(message);
    this.name = 'XError';
  }
}

export interface SearchQuery { terms?: string; fromUser?: string; sinceId?: string; count: number }

/** Stable boundary around the unofficial X integration. Write methods resolve only on confirmed success. */
export interface XClient {
  verify(): Promise<{ username: string; id: string }>;
  search(q: SearchQuery): Promise<XPost[]>;
  userPosts(handleOrId: string, count: number): Promise<XPost[]>;
  /** Returns the confirmed new post id; throws otherwise. */
  post(text: string, opts?: { replyTo?: string }): Promise<string>;
  like(id: string): Promise<void>;
  repost(id: string): Promise<void>;
}
