'use client';

import type { ReactNode } from 'react';
import {
  AppShell,
  Box,
  Burger,
  Container,
  Drawer,
  Group,
  Stack,
  Text,
  Title
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { CurrentUser } from '../../lib/auth';
import { Os7Logo, os7Brand } from '../../ui-kit/src/os7-brand';
import { AccountMenu } from './account-menu';
import { AppBreadcrumbs } from './app-breadcrumbs';
import { HeaderNav } from './header-nav';

type AppLayoutShellProps = {
  children: ReactNode;
  description?: string;
  siteHref: string;
  title?: string;
  usageSummary: {
    title: string;
    total: string;
  } | null;
  user: CurrentUser;
};

export function AppLayoutShell({
  children,
  description,
  siteHref,
  title,
  usageSummary,
  user
}: AppLayoutShellProps) {
  const [opened, { close, toggle }] = useDisclosure();

  return (
    <AppShell
      footer={{ height: 44, offset: false }}
      header={{ height: 64 }}
      padding="md"
    >
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
                opened={opened}
                onClick={toggle}
                hiddenFrom="sm"
                size="sm"
                aria-label="Toggle navigation"
              />
              <Os7Logo href={siteHref} w={48} />
            </Group>

            <Box style={{ minWidth: 0, overflow: 'hidden' }}>
              <HeaderNav />
            </Box>

            <Group gap="sm" justify="flex-end" wrap="nowrap">
              <AccountMenu usageSummary={usageSummary} user={user} />
            </Group>
          </Box>
        </Container>
      </AppShell.Header>

      <Drawer opened={opened} onClose={close} title="Navigation">
        <HeaderNav layout="drawer" onNavigate={close} />
      </Drawer>

      <AppShell.Main>
        <Container>
          <Stack gap="md">
            <AppBreadcrumbs />
            {title || description ? (
              <Box>
                {title ? <Title order={2}>{title}</Title> : null}
                {description ? <Text c="dimmed">{description}</Text> : null}
              </Box>
            ) : null}
            {children}
          </Stack>
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
  );
}
