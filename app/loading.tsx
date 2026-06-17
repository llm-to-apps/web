import { Center, Skeleton, Stack } from '@mantine/core'

export default function Loading() {
  return (
    <Center mih="100vh" p="xl">
      <Stack gap="md" w="min(720px, 100%)">
        <Skeleton height={34} radius="sm" width="40%" />
        <Skeleton height={180} radius="md" />
        <Skeleton height={120} radius="md" />
      </Stack>
    </Center>
  )
}
