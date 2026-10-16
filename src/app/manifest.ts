import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JustBot', short_name: 'JustBot', description: 'Autonomous trending news & X social agent',
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
