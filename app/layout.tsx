import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './globals.css'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AppSplash } from './_components/app-splash'
import { I18nProvider } from './_components/i18n-provider'
import { SessionProvider } from './_components/session-provider'
import { WebMantineProvider } from './mantine-provider'
import { defaultLocale, isLocale, localeCookieName } from '@/shared/i18n/config'

export const metadata: Metadata = {
  title: 'OS7 – your own agentic operating system',
  description: 'Your own agentic operating system.',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png'
  }
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(localeCookieName)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale

  return (
    <html lang={locale}>
      <body>
        <WebMantineProvider>
          <I18nProvider initialLocale={locale}>
            <SessionProvider>
              <AppSplash>{children}</AppSplash>
            </SessionProvider>
          </I18nProvider>
        </WebMantineProvider>
      </body>
    </html>
  )
}
