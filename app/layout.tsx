import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import type { Metadata } from 'next'
import { AppSplash } from './_components/app-splash'
import { I18nProvider } from './_components/i18n-provider'
import { SessionProvider } from './_components/session-provider'
import { WebMantineProvider } from './mantine-provider'

export const metadata: Metadata = {
  title: 'OS7 – your own agentic operating system',
  description: 'Your own agentic operating system.',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png'
  }
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <WebMantineProvider>
          <I18nProvider>
            <SessionProvider>
              <AppSplash>{children}</AppSplash>
            </SessionProvider>
          </I18nProvider>
        </WebMantineProvider>
      </body>
    </html>
  )
}
