'use client'

import type { ReactNode } from 'react'
import {
  AppShell,
  Box,
  Burger,
  Button,
  Container,
  Drawer,
  Group,
  Stack,
  Text
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useRouter } from 'next/navigation'
import { Os7Logo, os7Brand } from '../../ui-kit/src/os7-brand'
import { AccountMenu } from './account-menu'
import { AppBreadcrumbs, AppBreadcrumbsProvider } from './app-breadcrumbs'
import { AuthFlowProvider, useAuthFlow } from './auth-flow-provider'
import { HeaderNav } from './header-nav'
import { useI18n } from './i18n-provider'
import { ScrollToTop } from './scroll-to-top'
import { useSession } from './session-provider'

export function MainAppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthFlowProvider>
      <AppBreadcrumbsProvider>
        <MainAppShell>{children}</MainAppShell>
      </AppBreadcrumbsProvider>
    </AuthFlowProvider>
  )
}

function MainAppShell({ children }: { children: ReactNode }) {
  const [opened, { close, toggle }] = useDisclosure()
  const router = useRouter()
  const session = useSession()
  const { openAuthFlow } = useAuthFlow()
  const { t } = useI18n()
  const user = session.status === 'authenticated' ? session.data.user : null
  const usageSummary =
    session.status === 'authenticated' ? session.data.usageSummary : null
  const isHomeAvailable = Boolean(user?.onboarded)
  const logoHref = isHomeAvailable ? '/home' : '/hub'

  function openHomeAfterAuth() {
    openAuthFlow({
      onReady: () => {
        router.push('/home')
      }
    })
  }

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
            <Group gap="sm" wrap="nowrap">
              <Burger
                aria-label="Toggle navigation"
                hiddenFrom="sm"
                onClick={toggle}
                opened={opened}
                size="sm"
              />
              <Os7Logo href={logoHref} w={48} />
            </Group>

            <Box style={{ minWidth: 0, overflow: 'hidden' }}>
              <HeaderNav
                onProtectedNavigate={!isHomeAvailable ? openHomeAfterAuth : undefined}
              />
            </Box>

            <Group gap="sm" justify="flex-end" wrap="nowrap">
              {user ? (
                <AccountMenu usageSummary={usageSummary} user={user} />
              ) : (
                <Button onClick={() => openAuthFlow()} variant="subtle">
                  {t.auth.signIn}
                </Button>
              )}
            </Group>
          </Box>
        </Container>
      </AppShell.Header>

      <Drawer opened={opened} onClose={close} title="Navigation">
        <HeaderNav
          layout="drawer"
          onNavigate={close}
          onProtectedNavigate={() => {
            close()
            openHomeAfterAuth()
          }}
        />
      </Drawer>

      <AppShell.Main>
        <Container>
          <Stack gap="md">
            <AppBreadcrumbs
              onHomeNavigate={!isHomeAvailable ? openHomeAfterAuth : undefined}
            />
            {children}
          </Stack>
        </Container>
      </AppShell.Main>

      <AppShell.Footer pos="static">
        <Container h="100%">
          <Group h="100%" justify="space-between">
            <Text size="xs" c="dimmed">
              Build and run agentic apps.
            </Text>
            <Os7Logo h={18} href={os7Brand.siteHref} target="_blank" />
          </Group>
        </Container>
      </AppShell.Footer>
    </AppShell>
  )
}
