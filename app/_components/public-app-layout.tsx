'use client'

import type { ReactNode } from 'react'
import { AppShell, Box, Button, Container, Group, Stack, Text } from '@mantine/core'
import { Os7Logo, os7Brand } from '../../ui-kit/src/os7-brand'
import { AccountMenu } from './account-menu'
import { AuthModalProvider, useAuthModal } from './auth-modal-provider'
import { HeaderNav } from './header-nav'
import { ScrollToTop } from './scroll-to-top'
import { useSession } from './session-provider'

type PublicAppLayoutProps = {
  children: ReactNode
  siteHref?: string
}

export function PublicAppLayout({ children, siteHref = '/hub' }: PublicAppLayoutProps) {
  return (
    <AuthModalProvider>
      <PublicAppShell siteHref={siteHref}>{children}</PublicAppShell>
    </AuthModalProvider>
  )
}

function PublicAppShell({ children, siteHref }: PublicAppLayoutProps) {
  const session = useSession()
  const { openAuthModal } = useAuthModal()

  return (
    <AppShell footer={{ height: 44, offset: false }} header={{ height: 64 }} padding="md">
      <ScrollToTop />
      <AppShell.Header>
        <Container h="100%">
          <Box
            h="100%"
            style={{
              alignItems: 'center',
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'auto minmax(0, 1fr) auto'
            }}
          >
            <Os7Logo href={siteHref} w={48} />
            <Box style={{ minWidth: 0, overflow: 'hidden' }}>
              <HeaderNav
                onProtectedNavigate={
                  session.status === 'authenticated' ? undefined : openAuthModal
                }
              />
            </Box>
            <Group gap="sm" justify="flex-end" wrap="nowrap">
              {session.status === 'authenticated' ? (
                <AccountMenu
                  usageSummary={session.data.usageSummary}
                  user={session.data.user}
                />
              ) : (
                <Button onClick={openAuthModal} variant="subtle">
                  Sign in
                </Button>
              )}
            </Group>
          </Box>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container>
          <Stack gap="md">{children}</Stack>
        </Container>
      </AppShell.Main>

      <AppShell.Footer pos="static">
        <Container h="100%">
          <Group h="100%" justify="space-between">
            <Text c="dimmed" size="xs">
              Build and run agentic apps.
            </Text>
            <Os7Logo h={18} href={os7Brand.siteHref} target="_blank" />
          </Group>
        </Container>
      </AppShell.Footer>
    </AppShell>
  )
}
