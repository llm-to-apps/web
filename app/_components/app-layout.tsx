'use client';

import type { ReactNode } from 'react';
import type { CurrentUser } from '../../lib/auth';
import { Box, Center, Container, Stack, Text, Title } from '@mantine/core';
import { AppLayoutShell } from './app-layout-shell';
import type { UsageSummary } from './session-provider';

type AppLayoutProps = {
  user: CurrentUser | null;
  usageSummary?: UsageSummary;
  title?: string;
  description?: string;
  children: ReactNode;
};

export function AppLayout({
  user,
  usageSummary = null,
  title,
  description,
  children
}: AppLayoutProps) {
  if (user) {
    return (
      <AppLayoutShell
        description={description}
        siteHref="/home"
        title={title}
        usageSummary={usageSummary}
        user={user}
      >
        {children}
      </AppLayoutShell>
    );
  }

  return (
    <Box bg="gray.0" mih="100vh">
      <Container py="xl">
        <Center pt="10vh">
          <Stack gap="md">
            {title || description ? (
              <Box>
                {title ? <Title order={2}>{title}</Title> : null}
                {description ? <Text c="dimmed">{description}</Text> : null}
              </Box>
            ) : null}
            {children}
          </Stack>
        </Center>
      </Container>
    </Box>
  );
}
