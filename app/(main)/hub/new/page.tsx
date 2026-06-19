'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Grid, GridCol, Group, Stack, Text, Textarea } from '@mantine/core'
import { ChevronRight } from 'lucide-react'
import { useAuthFlow } from '@/app/_components/auth-flow-provider'
import { useI18n } from '@/app/_components/i18n-provider'
import { useSession } from '@/app/_components/session-provider'
import { HubFilePicker } from '@/app/hub/_components/hub-file-picker'
import type { ApiResponse } from '@/shared/api'

const minIntentLength = 256
const maxInitialFiles = 10

export default function NewHubTopicPage() {
  const router = useRouter()
  const session = useSession()
  const { format, locale, t } = useI18n()
  const hub = t.hub
  const { openAuthFlow } = useAuthFlow()
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [intent, setIntent] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const canCreateTopic = session.status === 'authenticated' && session.data.user.onboarded
  const trimmedIntentLength = intent.trim().length
  const canSubmit =
    canCreateTopic &&
    trimmedIntentLength >= minIntentLength &&
    files.length <= maxInitialFiles

  useEffect(() => {
    if (session.status === 'unauthenticated') {
      openAuthFlow()
    }
  }, [openAuthFlow, session.status])

  async function createTopic() {
    if (!canCreateTopic) {
      openAuthFlow()
      return
    }

    if (isCreating) {
      return
    }

    if (trimmedIntentLength < minIntentLength) {
      setError(format(hub.intentMinLength, { count: minIntentLength }))
      return
    }

    if (files.length > maxInitialFiles) {
      setError(hub.tooManyInitialFiles)
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.set('intent', intent)

      for (const file of files) {
        formData.append('files', file)
      }

      const response = await fetch('/api/hub/topics', {
        body: formData,
        method: 'POST'
      })
      const payload = (await response.json().catch(() => null)) as ApiResponse<{
        topic: { id: string }
      }> | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.createTopicFailed} (${response.status})`
        )
      }

      router.push(`/hub/${payload.data.topic.id}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : hub.createTopicFailed)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Stack gap="md">
      <Grid align="start" gap="lg">
        {!canCreateTopic ? (
          <GridCol span={12}>
            <Alert color="blue">{hub.signInToCreateTopic}</Alert>
          </GridCol>
        ) : null}
        {error ? (
          <GridCol span={12}>
            <Alert color="red">{error}</Alert>
          </GridCol>
        ) : null}
        <GridCol span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            <Textarea
              disabled={!canCreateTopic}
              minRows={10}
              onChange={(event) => setIntent(event.currentTarget.value)}
              placeholder={hub.intentPlaceholder}
              value={intent}
            />
            <Group justify="space-between">
              <Text
                c={trimmedIntentLength >= minIntentLength ? 'dimmed' : 'red'}
                size="xs"
              >
                {trimmedIntentLength} /{' '}
                {format(hub.intentMinLength, { count: minIntentLength })}
              </Text>
              <Button
                disabled={canCreateTopic && !canSubmit}
                loading={isCreating}
                onClick={createTopic}
                rightSection={<ChevronRight size={16} />}
              >
                {canCreateTopic ? hub.createTopic : hub.signIn}
              </Button>
            </Group>
          </Stack>
        </GridCol>
        <GridCol span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            <HubFilePicker
              buttonLabel={hub.initialFilesPlaceholder}
              description={hub.initialFilesDescription}
              disabled={!canCreateTopic}
              files={files}
              fullWidth
              locale={locale}
              onChange={setFiles}
              removeFileLabel={(name) => format(hub.removeFile, { name })}
            />
            {files.length > maxInitialFiles ? (
              <Alert color="red">{hub.tooManyInitialFiles}</Alert>
            ) : null}
          </Stack>
        </GridCol>
      </Grid>
    </Stack>
  )
}
