'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardData } from '@/web/data';

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.issues ? ': ' + j.issues.map((i: any) => `${i.path} ${i.message}`).join(', ') : ''}` : 'request failed');
  return j;
}
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

export function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  useEffect(() => { const t = setInterval(() => router.refresh(), 20000); return () => clearInterval(t); }, [router]);
  const act = (fn: () => Promise<unknown>) => async () => { try { setMsg(''); await fn(); router.refresh(); } catch (e: any) { setMsg(e.message); } };
  const { control: c, settings: s, account: a, usage: u } = data;

  return (
    <main>
      <header>
        <h1>xBot</h1>
        <div className="row">
          <button onClick={act(() => call('/api/control', 'POST', { paused: !c.paused }))}>{c.paused ? 'Resume' : 'Pause'}</button>
          {c.emergencyStop
            ? <button onClick={act(() => call('/api/control', 'POST', { emergencyStop: false }))}>Clear emergency stop</button>
            : <button className="danger" onClick={act(() => confirm('Halt ALL bot activity immediately?') ? call('/api/control', 'POST', { emergencyStop: true }) : Promise.resolve())}>Emergency stop</button>}
          <button onClick={act(async () => { await call('/api/logout', 'POST'); location.href = '/login'; })}>Sign out</button>
        </div>
      </header>
      {c.emergencyStop && <div className="banner bad">EMERGENCY STOP ACTIVE — all jobs and actions are halted.</div>}
      {c.paused && !c.emergencyStop && <div className="banner warn">Bot is paused.</div>}
      {s.dryRun && <div className="banner warn">Dry-run mode: no write actions are performed on X.</div>}
      {!s.autoPublish && <div className="banner warn">Publishing is off: approved drafts will wait until “Auto publish” is enabled in Settings.</div>}
      {msg && <div className="banner bad">{msg}</div>}

      <div className="grid">
        <section className="card"><h2>Account</h2>
          <div className={a.status === 'connected' ? 'ok' : 'bad'}><b>{a.status}</b>{a.username ? ` @${a.username}` : ''}</div>
          <div className="muted">Checked {fmt(a.checked_at)}</div>
          {a.status === 'expired' && <div className="bad">Session cookie expired. Update X_API_KEY and restart the worker.</div>}
          {a.detail && <div className="muted">{a.detail}</div>}
        </section>
        <section className="card"><h2>AI usage (est.)</h2>
          <div>Today ${u.dayUsd.toFixed(4)} / ${s.dailyBudgetUsd}</div>
          <div>Month ${u.monthUsd.toFixed(4)} / ${s.monthlyBudgetUsd}</div>
          <div className="muted">{u.monthInputTokens.toLocaleString()} in / {u.monthOutputTokens.toLocaleString()} out tokens</div>
        </section>
        <section className="card"><h2>Today’s actions</h2>
          {(['post', 'reply', 'like', 'repost'] as const).map((t) => (<div key={t}>{t}: {data.today[t] ?? 0} / {s[t === 'post' ? 'maxPostsPerDay' : t === 'reply' ? 'maxRepliesPerDay' : t === 'like' ? 'maxLikesPerDay' : 'maxRepostsPerDay']}</div>))}
        </section>
        <section className="card"><h2>Posts seen</h2>
          {Object.entries(data.posts).map(([k, v]) => <div key={k}>{k}: {v as number}</div>)}{!Object.keys(data.posts).length && <div className="muted">none yet</div>}
        </section>
      </div>

      <section className="card"><h2>Drafts</h2>
        <NewDraft act={act} />
        {data.drafts.map((d) => <DraftRow key={d.id} d={d} act={act} />)}
        {!data.drafts.length && <div className="muted">No drafts yet. Add topics in Settings; the generator runs on its interval.</div>}
      </section>

      <SettingsForm s={s} act={act} />

      <section className="card"><h2>Activity</h2>
        <table><thead><tr><th>Time</th><th>Type</th><th>Status</th><th>Target / result</th><th>Detail</th></tr></thead><tbody>
          {data.actions.map((x) => <tr key={x.id}><td>{fmt(x.created_at)}</td><td>{x.type}</td><td className={x.status === 'succeeded' ? 'ok' : x.status === 'failed' ? 'bad' : ''}>{x.status}</td><td>{x.result_x_id ?? x.target_x_id ?? ''}</td><td>{x.detail}</td></tr>)}
        </tbody></table>
      </section>

      <div className="grid">
        <section className="card"><h2>Jobs</h2>
          <table><tbody>{data.jobs.map((j) => <tr key={j.name}><td>{j.name}</td><td className={j.last_status === 'error' ? 'bad' : ''}>{j.last_status ?? '—'}</td><td className="muted">next {fmt(j.next_run_at)}</td></tr>)}</tbody></table>
        </section>
        <section className="card"><h2>Recent errors</h2>
          {data.errors.map((e) => <div key={e.id} className="muted"><b>{e.source}</b> {fmt(e.created_at)}<br />{e.message}</div>)}
          {!data.errors.length && <div className="muted">None</div>}
        </section>
      </div>
    </main>
  );
}

function NewDraft({ act }: { act: (f: () => Promise<unknown>) => () => Promise<void> }) {
  const [t, setT] = useState('');
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <input style={{ flex: 1, minWidth: 200 }} placeholder="Write a draft manually…" value={t} onChange={(e) => setT(e.target.value)} />
      <button disabled={!t.trim()} onClick={act(async () => { await call('/api/drafts', 'POST', { action: 'create', text: t }); setT(''); })}>Add draft</button>
    </div>
  );
}

function DraftRow({ d, act }: { d: DashboardData['drafts'][number]; act: (f: () => Promise<unknown>) => () => Promise<void> }) {
  const [text, setText] = useState(d.text);
  const editable = d.status === 'draft' || d.status === 'approved';
  const post = (body: object) => act(() => call('/api/drafts', 'POST', { id: d.id, ...body }));
  return (
    <div className="draft">
      <div className="muted">#{d.id} · {d.kind}{d.reply_to_x_id ? ` → ${d.reply_to_x_id}` : ''} · <b>{d.status}</b>{d.scheduled_for ? ` · scheduled ${fmt(d.scheduled_for)}` : ''}{d.x_id ? ` · x:${d.x_id}` : ''}</div>
      {editable ? <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /> : <div>{d.text}</div>}
      {d.rationale && <div className="muted">Why: {d.rationale}</div>}
      {d.error && <div className="bad">{d.error}</div>}
      <div className="row">
        {editable && text !== d.text && <button onClick={post({ action: 'edit', text })}>Save edit</button>}
        {d.status === 'draft' && <button className="primary" onClick={post({ action: 'approve' })}>Approve</button>}
        {editable && <button onClick={post({ action: 'reject' })}>Reject</button>}
        {d.status === 'failed' && <button onClick={post({ action: 'retry' })}>Back to draft</button>}
      </div>
    </div>
  );
}

const LISTS = ['searchTerms', 'accounts', 'topics'] as const;
const NUMS = ['pollIntervalMin', 'generateIntervalMin', 'maxPostChars', 'minRelevance', 'minQuality', 'similarityThreshold', 'maxPostsPerDay', 'maxLikesPerDay', 'maxRepostsPerDay', 'maxRepliesPerDay', 'minActionSpacingSec', 'maxPostsProcessedPerRun', 'dailyBudgetUsd', 'monthlyBudgetUsd'] as const;
const FLAGS = ['dryRun', 'autoPublish', 'autoLike', 'autoRepost'] as const;

function SettingsForm({ s, act }: { s: DashboardData['settings']; act: (f: () => Promise<unknown>) => () => Promise<void> }) {
  const [v, setV] = useState<any>({ ...s, ...Object.fromEntries(LISTS.map((k) => [k, s[k].join('\n')])) });
  const save = act(() => call('/api/settings', 'PUT', { ...v, ...Object.fromEntries(LISTS.map((k) => [k, String(v[k]).split('\n').map((x) => x.trim()).filter(Boolean)])), ...Object.fromEntries(NUMS.map((k) => [k, Number(v[k])])) }));
  return (
    <section className="card"><h2>Settings</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        {FLAGS.map((k) => <label className="check" key={k}><input type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />{k}</label>)}
      </div>
      <div className="grid">
        {LISTS.map((k) => <label key={k}>{k} (one per line)<textarea rows={4} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
        <label>voice<textarea rows={4} value={v.voice} onChange={(e) => setV({ ...v, voice: e.target.value })} /></label>
        {NUMS.map((k) => <label key={k}>{k}<input type="number" step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
      </div>
      <p><button className="primary" onClick={save}>Save settings</button></p>
    </section>
  );
}
