'use client'

import { FormEvent, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core'
import {
  AtSign,
  Brain,
  CheckCircle2,
  Code2,
  LoaderCircle,
  Sparkles,
  UserRound
} from 'lucide-react'
import { ExperienceField } from './experience-field'
import { FormActions } from './form-actions'
import { useI18n } from './i18n-provider'
import { useSession, type SessionData } from './session-provider'
import type { ApiResponse } from '@/shared/api'

type OnboardingResponse = ApiResponse
type UsernameAvailabilityResponse = ApiResponse<{
  available: boolean
  normalized: string
  reason: string | null
}>

type UsernameStatus = {
  available: boolean
  message: string | null
  state: 'idle' | 'checking' | 'ready' | 'unavailable'
}

type OnboardingFormProps = {
  frame?: 'paper' | 'plain'
  onCompleted?: () => void
  session: SessionData
  showHeader?: boolean
}

export function OnboardingForm({
  frame = 'paper',
  onCompleted,
  session,
  showHeader = true
}: OnboardingFormProps) {
  const sessionContext = useSession()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [username, setUsername] = useState(session.user.username)
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>({
    available: false,
    message: null,
    state: 'idle'
  })
  const experienceOptionLabels = {
    advanced: t.profile.experienceAdvanced,
    beginner: t.profile.experienceBeginner,
    none: t.profile.experienceNone
  }

  useEffect(() => {
    const normalizedUsername = username.trim().toLowerCase()

    if (!normalizedUsername) {
      setUsernameStatus({
        available: false,
        message: t.profile.usernameRequired,
        state: 'unavailable'
      })
      return
    }

    setUsernameStatus({
      available: false,
      message: null,
      state: 'checking'
    })

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      void checkUsernameAvailability(normalizedUsername, controller.signal)
        .then((result) => {
          if (!result) {
            return
          }

          setUsername(result.normalized)
          setUsernameStatus({
            available: result.available,
            message: result.available
              ? t.profile.usernameAvailable
              : t.profile.usernameUnavailable,
            state: result.available ? 'ready' : 'unavailable'
          })
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }

          setUsernameStatus({
            available: false,
            message: t.profile.usernameCheckFailed,
            state: 'unavailable'
          })
        })
    }, 300)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [
    t.profile.usernameAvailable,
    t.profile.usernameCheckFailed,
    t.profile.usernameRequired,
    t.profile.usernameUnavailable,
    username
  ])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const usernameValue = String(formData.get('username') ?? '')
      .trim()
      .toLowerCase()

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          aiExperienceLevel: formData.get('aiExperienceLevel'),
          name,
          username: usernameValue,
          vibeCodingExperienceLevel: formData.get('vibeCodingExperienceLevel')
        })
      })
      const data = (await response.json().catch(() => null)) as OnboardingResponse | null

      if (!response.ok || !data || !data.ok) {
        throw new Error(
          data && !data.ok
            ? data.error.message
            : `Failed to complete onboarding (${response.status})`
        )
      }

      await sessionContext.refresh()
      onCompleted?.()
    } catch (error) {
      setError(error instanceof Error ? error.message : t.welcome.nameRequired)
    } finally {
      setIsSaving(false)
    }
  }

  const content = (
    <Stack gap="md">
      {showHeader ? (
        <Group align="flex-start">
          <ThemeIcon color="gray" size="xl" variant="light">
            <Sparkles size={28} />
          </ThemeIcon>
          <div>
            <Title id="welcome-title" order={1}>
              {t.welcome.title}
            </Title>
            <Text c="dimmed">{t.welcome.description}</Text>
          </div>
        </Group>
      ) : null}

      {error ? <Alert color="red">{error}</Alert> : null}

      <TextInput
        autoComplete="name"
        defaultValue={session.user.name ?? ''}
        label={t.profile.nameLabel}
        leftSection={<UserRound size={16} />}
        name="name"
        placeholder={t.profile.namePlaceholder}
        required
      />

      <TextInput
        autoComplete="username"
        description={t.profile.usernameDescription}
        error={
          usernameStatus.state === 'unavailable' ? usernameStatus.message : undefined
        }
        label={t.profile.usernameLabel}
        leftSection={<AtSign size={16} />}
        maxLength={18}
        name="username"
        onChange={(event) => setUsername(event.currentTarget.value)}
        placeholder={t.profile.usernamePlaceholder}
        required
        rightSection={
          usernameStatus.state === 'checking' ? (
            <LoaderCircle size={16} />
          ) : usernameStatus.state === 'ready' ? (
            <CheckCircle2 size={16} />
          ) : null
        }
        value={username}
      />

      <ExperienceField
        icon={<Brain size={16} />}
        label={t.profile.aiExperienceLabel}
        name="aiExperienceLevel"
        optionLabels={experienceOptionLabels}
      />

      <ExperienceField
        icon={<Code2 size={16} />}
        label={t.profile.vibeCodingExperienceLabel}
        name="vibeCodingExperienceLevel"
        optionLabels={experienceOptionLabels}
      />

      <FormActions>
        <Button
          disabled={!usernameStatus.available || usernameStatus.state === 'checking'}
          loading={isSaving}
          type="submit"
        >
          {t.welcome.continue}
        </Button>
      </FormActions>
    </Stack>
  )

  if (frame === 'plain') {
    return <form onSubmit={handleSubmit}>{content}</form>
  }

  return (
    <Paper component="form" onSubmit={handleSubmit} p="xl" withBorder>
      {content}
    </Paper>
  )
}

async function checkUsernameAvailability(username: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/onboarding/username?username=${encodeURIComponent(username)}`,
    {
      cache: 'no-store',
      signal
    }
  )
  const payload = (await response
    .json()
    .catch(() => null)) as UsernameAvailabilityResponse | null

  if (!response.ok || !payload?.ok) {
    return null
  }

  return payload.data
}
