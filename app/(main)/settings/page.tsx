'use client'

import { FormEvent, useState } from 'react'
import { Alert, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { Brain, Code2, UserRound } from 'lucide-react'
import { ExperienceField } from '@/app/_components/experience-field'
import { FormActions } from '@/app/_components/form-actions'
import { LanguageSwitcher } from '@/app/_components/language-switcher'
import { SessionGate } from '@/app/_components/session-gate'
import type { SessionData } from '@/app/_components/session-provider'
import { useSession } from '@/app/_components/session-provider'
import { useI18n } from '@/app/_components/i18n-provider'
import type { ApiResponse } from '@/shared/api'

type SaveResponse = ApiResponse

export default function SettingsPage() {
  return <SessionGate>{(session) => <SettingsContent session={session} />}</SessionGate>
}

function SettingsContent({ session }: { session: SessionData }) {
  const router = useRouter()
  const { t } = useI18n()
  const currentSession = useSession()
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const experienceOptionLabels = {
    advanced: t.profile.experienceAdvanced,
    beginner: t.profile.experienceBeginner,
    none: t.profile.experienceNone
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          aiExperienceLevel: formData.get('aiExperienceLevel'),
          name,
          vibeCodingExperienceLevel: formData.get('vibeCodingExperienceLevel')
        })
      })
      const data = (await response.json().catch(() => null)) as SaveResponse | null

      if (!response.ok || !data || !data.ok) {
        throw new Error(
          data && !data.ok
            ? data.error.message
            : `Failed to save settings (${response.status})`
        )
      }

      await currentSession.refresh()
      router.push('/home')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{t.settings.profileTitle}</Title>
        <Text c="dimmed">{t.settings.profileDescription}</Text>
      </div>

      <Paper component="form" onSubmit={handleSubmit} p="lg" withBorder>
        <Stack gap="md">
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

          <ExperienceField
            defaultValue={session.user.aiExperienceLevel}
            icon={<Brain size={16} />}
            label={t.profile.aiExperienceLabel}
            name="aiExperienceLevel"
            optionLabels={experienceOptionLabels}
          />

          <ExperienceField
            defaultValue={session.user.vibeCodingExperienceLevel}
            icon={<Code2 size={16} />}
            label={t.profile.vibeCodingExperienceLabel}
            name="vibeCodingExperienceLevel"
            optionLabels={experienceOptionLabels}
          />

          <FormActions>
            <Button loading={isSaving} type="submit">
              {t.settings.saveChanges}
            </Button>
          </FormActions>
        </Stack>
      </Paper>

      <Paper p="lg" withBorder>
        <Group align="center" justify="space-between">
          <div>
            <Title order={3}>{t.settings.languageTitle}</Title>
            <Text c="dimmed">{t.settings.languageDescription}</Text>
          </div>
          <LanguageSwitcher variant="segmented" />
        </Group>
      </Paper>
    </Stack>
  )
}
