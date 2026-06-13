import './globals.css';
import type { Metadata } from 'next';
import { getRequestLocale } from '@/lib/i18n/server';
import { I18nProvider } from './ui/i18n-provider';

export const metadata: Metadata = {
  title: 'OS7 – your own agentic operating system',
  description: 'Your own agentic operating system.',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png'
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
