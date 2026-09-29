import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export function generateStaticParams() { return ['180', '192', '512', 'maskable-512'].map((size) => ({ size })); }

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const maskable = size.startsWith('maskable');
  const px = Number(size.replace('maskable-', ''));
  if (!Number.isFinite(px) || px < 16 || px > 1024) return new Response('not found', { status: 404 });
  const glyph = Math.round(px * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#101113', borderRadius: maskable ? 0 : Math.round(px * 0.22) }}>
        <div style={{ width: glyph, height: glyph, borderRadius: Math.round(glyph * 0.28), background: '#4c6ef5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(glyph * 0.72), fontWeight: 800 }}>x</div>
      </div>
    ),
    { width: px, height: px },
  );
}
