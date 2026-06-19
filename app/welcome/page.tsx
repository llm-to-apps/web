'use client'

import { useEffect } from 'react'
import { Center, Container, Group, Stack, Text } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { OnboardingForm } from '../_components/onboarding-form'
import { SessionGate } from '../_components/session-gate'
import type { SessionData } from '../_components/session-provider'
import { Os7Logo } from '../../ui-kit/src/os7-brand'

export default function WelcomePage() {
  return (
    <SessionGate requireOnboarded={false}>
      {(session) => <WelcomeContent session={session} />}
    </SessionGate>
  )
}

function WelcomeContent({ session }: { session: SessionData }) {
  const router = useRouter()

  useEffect(() => {
    if (session.user.onboarded) {
      router.replace('/home')
    }
  }, [router, session.user.onboarded])

  return (
    <Container py="xl">
      <Center>
        <Stack gap="lg" w="100%">
          <Group justify="center">
            <Os7Logo w={90} />
            <Text c="dimmed" fw={700} size="xs">
              Beta
            </Text>
          </Group>

          <OnboardingForm onCompleted={() => router.push('/home')} session={session} />
        </Stack>
      </Center>
    </Container>
  )
}
