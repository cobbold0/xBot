'use client';
import { useState } from 'react';

export default function Login() {
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get('password');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (r.ok) location.href = '/'; else setErr(r.status === 429 ? 'Too many attempts. Try later.' : 'Invalid password');
  }
  return (
    <main style={{ maxWidth: 360, marginTop: 80 }}>
      <form className="card" onSubmit={submit}>
        <h1>xBot</h1>
        <label>Password<input name="password" type="password" autoFocus required autoComplete="current-password" /></label>
        {err && <p className="bad">{err}</p>}
        <p><button className="primary">Sign in</button></p>
      </form>
    </main>
  );
}
