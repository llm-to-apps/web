'use client'

import type { ReactNode } from 'react'
import { Box, Center, Container, Stack, Text, Title } from '@mantine/core'

type AppLayoutProps = {
  user?: null
  title?: string
  description?: string
  children: ReactNode
}

export function AppLayout({ title, description, children }: AppLayoutProps) {
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
  )
}
