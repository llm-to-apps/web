'use client'

import Link from 'next/link'
import { Button, Center, Stack, Text, Title } from '@mantine/core'

export default function NotFound() {
  return (
    <Center mih="100vh" p="xl">
      <Stack align="center" gap="sm" maw={520} ta="center">
        <Title order={1}>Page not found</Title>
        <Text c="dimmed">The page may have moved or no longer exists.</Text>
        <Button component={Link} href="/home" variant="light">
          Back to home
        </Button>
      </Stack>
    </Center>
  )
}
