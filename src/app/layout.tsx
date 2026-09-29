import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/dates/styles.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'xBot',
  robots: { index: false, follow: false },
  applicationName: 'xBot',
  appleWebApp: { capable: true, title: 'xBot', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/192', apple: '/icons/180' },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#101113' }, { media: '(prefers-color-scheme: light)', color: '#ffffff' }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head><ColorSchemeScript defaultColorScheme="auto" /></head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
