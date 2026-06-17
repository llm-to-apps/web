'use client'

import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { os7Theme } from '../ui-kit/src/os7-theme'

export function WebMantineProvider({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={os7Theme}>
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  )
}
