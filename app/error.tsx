'use client'

import { Alert, Button, Center, Stack } from '@mantine/core'

export default function ErrorBoundary({
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <Center mih="100vh" p="xl">
      <Stack maw={520} w="100%">
        <Alert color="red" title="Something went wrong">
          The page could not be loaded.
        </Alert>
        <Button onClick={reset} variant="light">
          Try again
        </Button>
      </Stack>
    </Center>
  )
}
