'use client';
import { useEffect, type ReactNode } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';

const theme = createTheme({ primaryColor: 'indigo', defaultRadius: 'md', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' });

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ModalsProvider>
        <Notifications position="top-center" containerWidth={360} zIndex={3000} />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
