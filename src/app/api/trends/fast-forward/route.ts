import { z } from 'zod';
import { guard, HttpError } from '@/web/api';
import { q } from '@/core/db/pool';
import { getTenantId } from '@/core/tenant';
import { getSettings } from '@/core/settings';
import { createLlm } from '@/core/ai/llm';
import { AiAgent } from '@/core/ai/agent';
import { textHash } from '@/core/generation/dedup';
import type { XPost } from '@/core/x/types';

export const dynamic = 'force-dynamic';

const Body = z.object({
  postId: z.number().int().positive(),
  customInstruction: z.string().trim().max(300).optional(),
}).strict();

export const POST = guard(async (req) => {
  const userId = getTenantId();
  const { postId, customInstruction } = Body.parse(await req.json());

  const { rows: postRows } = await q<any>(
    `SELECT x_id, author_id, author_handle, text, metadata, source, analysis FROM posts WHERE user_id = $1 AND id = $2`,
    [userId, postId],
  );
  const p = postRows[0];
  if (!p) throw new HttpError(404, 'Story not found');

  const s = await getSettings(userId);
  const ai = new AiAgent(createLlm(), s);

  const inspiration: XPost = {
    id: p.x_id,
    authorId: p.author_id || '',
    authorHandle: p.author_handle || '',
    text: p.text,
    createdAt: p.metadata?.createdAt || '',
    likes: p.metadata?.likes ?? 0,
    reposts: p.metadata?.reposts ?? 0,
    replies: p.metadata?.replies ?? 0,
    views: p.metadata?.views,
    isReply: false,
    isRepost: false,
  };

  const { rows: recentDrafts } = await q<{ text: string }>(
    `SELECT text FROM drafts WHERE user_id = $1 AND kind = 'post' ORDER BY id DESC LIMIT 30`,
    [userId],
  );
  const recent = recentDrafts.map((r) => r.text);

  if (customInstruction) {
    s.voice = `${s.voice}. Extra focus for this post: ${customInstruction}`;
  }

  const { rows: fbRows } = await q<{ rating: number; text: string }>(
    `SELECT fb.rating, COALESCE(d.text, a.detail) AS text
     FROM feedback fb
     LEFT JOIN drafts d ON fb.target_type = 'draft' AND d.id = fb.target_id
     LEFT JOIN actions a ON fb.target_type = 'action' AND a.id = fb.target_id
     WHERE fb.user_id = $1 AND (d.text IS NOT NULL OR a.detail IS NOT NULL)
     ORDER BY fb.updated_at DESC LIMIT 30`,
    [userId],
  );
  const liked = fbRows.filter((r) => r.rating >= 4 || r.rating === 1).map((r) => r.text.slice(0, 200)).slice(0, 5);
  const disliked = fbRows.filter((r) => r.rating === -1 || (r.rating > 0 && r.rating <= 2)).map((r) => r.text.slice(0, 200)).slice(0, 5);

  const generated = await ai.generatePosts(1, recent, [inspiration], { liked, disliked });
  const post = generated[0];
  if (!post) throw new HttpError(500, 'AI could not generate a draft for this story');

  const r = await q<{ id: number }>(
    `INSERT INTO drafts(user_id, kind, text, text_hash, topic, rationale, media_type, media_prompt, status)
     VALUES ($1, 'post', $2, $3, $4, $5, $6, $7, 'draft')
     RETURNING id`,
    [
      userId,
      post.text.trim(),
      textHash(post.text.trim()),
      post.topic || p.analysis?.topic || 'Trending News',
      post.rationale || `Synthesized from ${p.source} by @${p.author_handle}`,
      post.mediaType ?? 'image',
      post.mediaPrompt || null,
    ],
  );

  return {
    ok: true,
    draftId: r.rows[0].id,
    text: post.text.trim(),
    topic: post.topic,
    mediaType: post.mediaType,
    mediaPrompt: post.mediaPrompt,
  };
});
