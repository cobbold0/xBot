import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'xBot', short_name: 'xBot', description: 'Self-hosted X agent dashboard',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#101113', theme_color: '#101113',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'Drafts', url: '/drafts' }, { name: 'Activity', url: '/activity' }],
  };
}
