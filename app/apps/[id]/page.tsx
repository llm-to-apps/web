'use client'

import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  Alert,
  Center,
  Grid,
  GridCol,
  Loader,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title
} from '@mantine/core'
import { useParams, useSearchParams } from 'next/navigation'
import { formatMessage } from '@/shared/i18n/dictionaries'
import { useI18n } from '../../_components/i18n-provider'
import { ProjectAgentPanel } from './project-agent-panel'
import { ProjectOAuthBridge } from './project-oauth-bridge'
import type { ApiResponse } from '@/shared/api'

type ProjectWorkspace = {
  activeRunId: string | null
  appOrigin: string
  messages: ComponentProps<typeof ProjectAgentPanel>['initialMessages']
  project: ComponentProps<typeof ProjectAgentPanel>['project'] & {
    deployError: string | null
    devUrl: string
  }
  usageSummary: ComponentProps<typeof ProjectAgentPanel>['usageSummary']
}

type ProjectWorkspaceResponse = ApiResponse<ProjectWorkspace>

type ProjectStatusResponse = ApiResponse<{
  dev: {
    ready: boolean
    url: string
  }
  prod: {
    ready: boolean
    url: string
  }
  project: {
    id: string
    status: string
  }
}>

export default function ProjectPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { locale, t } = useI18n()
  const [data, setData] = useState<ProjectWorkspace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [devReadyUrl, setDevReadyUrl] = useState<string | null>(null)
  const [devError, setDevError] = useState<string | null>(null)
  const mode = searchParams.get('mode') === 'dev' ? 'dev' : 'use'
  const previewUrl = mode === 'dev' ? devReadyUrl : data?.project.appUrl
  const localizedPreviewUrl = previewUrl ? previewUrlWithLocale(previewUrl, locale) : null

  useEffect(() => {
    let isCurrent = true

    async function loadProject() {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(params.id)}/workspace?mode=${mode}`,
        {
          cache: 'no-store'
        }
      )
      const payload = (await response
        .json()
        .catch(() => null)) as ProjectWorkspaceResponse | null

      if (!isCurrent) {
        return
      }

      if (!response.ok || !payload || !payload.ok) {
        setError(
          payload && !payload.ok
            ? payload.error.message
            : `Failed to load application (${response.status})`
        )
        return
      }

      setData({
        activeRunId: payload.data.activeRunId,
        appOrigin: payload.data.appOrigin,
        messages: payload.data.messages,
        project: payload.data.project,
        usageSummary: payload.data.usageSummary
      })
    }

    void loadProject()

    return () => {
      isCurrent = false
    }
  }, [mode, params.id])

  useEffect(() => {
    setDevReadyUrl(null)
    setDevError(null)

    if (mode !== 'dev' || data?.project.status !== 'ready') {
      return undefined
    }

    let isCurrent = true
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null
    let keepAliveIntervalId: ReturnType<typeof setInterval> | null = null

    async function startDevServer() {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(params.id)}/dev-start`,
        {
          cache: 'no-store',
          method: 'POST'
        }
      )
      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!isCurrent) {
        return false
      }

      if (!response.ok || !payload?.ok) {
        setDevError(
          payload && !payload.ok
            ? payload.error.message || 'Development server did not start'
            : `Development server did not start (${response.status})`
        )
        return false
      }

      return true
    }

    async function checkDevServer() {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(params.id)}/status`,
          {
            cache: 'no-store'
          }
        )
        const payload = (await response
          .json()
          .catch(() => null)) as ProjectStatusResponse | null

        if (!isCurrent) {
          return
        }

        if (!response.ok || !payload || !payload.ok) {
          setDevError(
            payload && !payload.ok
              ? payload.error.message || 'Development preview is unavailable'
              : `Development preview is unavailable (${response.status})`
          )
          return
        }

        if (payload.data.dev.ready) {
          setDevReadyUrl(payload.data.dev.url)
          return
        }

        pollTimeoutId = setTimeout(checkDevServer, 1200)
      } catch {
        if (isCurrent) {
          pollTimeoutId = setTimeout(checkDevServer, 1200)
        }
      }
    }

    async function startAndWait() {
      const started = await startDevServer()

      if (!started) {
        return
      }

      keepAliveIntervalId = setInterval(() => {
        void startDevServer()
      }, 30_000)
      await checkDevServer()
    }

    void startAndWait()

    return () => {
      isCurrent = false
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId)
      }
      if (keepAliveIntervalId) {
        clearInterval(keepAliveIntervalId)
      }
    }
  }, [data?.project.status, mode, params.id])

  if (error) {
    return (
      <Center h="100vh" p="md">
        <Alert color="red">{error}</Alert>
      </Center>
    )
  }

  if (!data) {
    return (
      <Grid h="100vh" p="md" styles={{ inner: { height: '100%' } }}>
        <GridCol
          display="flex"
          h={{ base: 'auto', lg: '100%' }}
          span={{ base: 12, lg: 4 }}
        >
          <Skeleton flex={1} radius="md" />
        </GridCol>
        <GridCol
          display="flex"
          h={{ base: 'auto', lg: '100%' }}
          span={{ base: 12, lg: 8 }}
        >
          <Skeleton flex={1} radius="md" />
        </GridCol>
      </Grid>
    )
  }

  return (
    <Grid h="100vh" p="md" styles={{ inner: { height: '100%' } }}>
      <ProjectOAuthBridge appOrigin={data.appOrigin} projectId={data.project.id} />
      <GridCol display="flex" h={{ base: 'auto', lg: '100%' }} span={{ base: 12, lg: 4 }}>
        <ProjectAgentPanel
          activeRunId={data.activeRunId}
          initialMessages={data.messages}
          project={data.project}
          usageSummary={data.usageSummary}
        />
      </GridCol>

      <GridCol display="flex" h={{ base: 'auto', lg: '100%' }} span={{ base: 12, lg: 8 }}>
        <Stack flex={1} gap="sm" h="100%" mih={0} w="100%">
          {data.project.status === 'ready' ? (
            <Paper flex={1} style={{ overflow: 'hidden' }} withBorder>
              {devError ? (
                <Center h="100%" p="md">
                  <Alert color="red">{devError}</Alert>
                </Center>
              ) : previewUrl ? (
                <iframe
                  src={localizedPreviewUrl ?? previewUrl}
                  style={{
                    border: 0,
                    display: 'block',
                    height: '100%',
                    width: '100%'
                  }}
                  title={formatMessage(t.project.iframeTitle, {
                    name: data.project.name
                  })}
                />
              ) : (
                <Center h="100%" p="md">
                  <Stack align="center" gap="sm">
                    <Loader size="sm" />
                    <Text c="dimmed" size="sm">
                      Starting development preview...
                    </Text>
                  </Stack>
                </Center>
              )}
            </Paper>
          ) : (
            <Paper flex={1} withBorder>
              <Center h="100%">
                <Stack align="center">
                  <Title order={2}>
                    {formatMessage(t.project.applicationStatus, {
                      status: data.project.status
                    })}
                  </Title>
                  <Text c="dimmed">
                    {data.project.deployError || t.project.previewPending}
                  </Text>
                </Stack>
              </Center>
            </Paper>
          )}
        </Stack>
      </GridCol>
    </Grid>
  )
}

function previewUrlWithLocale(previewUrl: string, locale: string) {
  const url = new URL(previewUrl)
  url.searchParams.set('lang', locale)
  return url.toString()
}
