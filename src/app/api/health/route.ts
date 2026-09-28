import { NextResponse } from 'next/server';
import { q } from '@/core/db/pool';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await q('SELECT 1'); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
