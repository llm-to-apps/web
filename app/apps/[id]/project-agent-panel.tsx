'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ActionIcon, Box, Group, Paper, Stack, Text } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '../../_components/i18n-provider'
import {
  ProjectAgentChat,
  type AgentMode,
  type ProjectAgentChatHandle
} from './project-agent-chat'
import { ProjectSettingsMenu } from './project-settings-menu'

type ProjectAgentPanelProps = {
  activeRunId?: string | null
  initialMessages?: Array<{
    id: string
    role: 'assistant' | 'user'
    source?: string | null
    content: string
    usage?: {
      creditsUsed: number
    } | null
  }>
  project: {
    appUrl: string
    id: string
    name: string
    status: string
    domain: string
    toolsUrl: string
  }
  usageSummary?: {
    title: string
    total: string
  } | null
}

export function ProjectAgentPanel({
  activeRunId = null,
  initialMessages = [],
  project,
  usageSummary = null
}: ProjectAgentPanelProps) {
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = useMemo<AgentMode>(
    () => (searchParams.get('mode') === 'dev' ? 'dev' : 'use'),
    [searchParams]
  )
  const [isSending, setIsSending] = useState(false)
  const chatRef = useRef<ProjectAgentChatHandle | null>(null)

  const handleSendingChange = useCallback((nextIsSending: boolean) => {
    setIsSending(nextIsSending)
  }, [])

  const handleModeChange = useCallback(
    (nextMode: AgentMode) => {
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.set('mode', nextMode)
      router.replace(`${pathname}?${nextParams.toString()}`, {
        scroll: false
      })
    },
    [pathname, router, searchParams]
  )

  return (
    <Paper h="100%" mih={0} p="md" style={{ overflow: 'hidden' }} w="100%" withBorder>
      <Stack h="100%" mih={0} pos="relative">
        <Box
          left={0}
          pos="absolute"
          right={0}
          style={{
            background:
              'linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.92) 58%, rgba(255,255,255,0) 100%)',
            zIndex: 2
          }}
          top={0}
        >
          <Group pb="xl" pt={0} justify="space-between">
            <Group gap="sm">
              <ActionIcon
                aria-label={t.project.appsBack}
                component={Link}
                href="/home"
                variant="subtle"
              >
                <ArrowLeft size={17} />
              </ActionIcon>
            </Group>
            <Group gap="sm">
              {usageSummary ? (
                <Text c="dimmed" fw={700} title={usageSummary.title}>
                  {usageSummary.total}
                </Text>
              ) : null}
              <ProjectSettingsMenu
                isClearHistoryDisabled={isSending}
                onClearHistory={() => chatRef.current?.clearHistory()}
                project={{
                  appUrl: project.appUrl,
                  id: project.id,
                  domain: project.domain,
                  templateName: project.name
                }}
              />
            </Group>
          </Group>
        </Box>

        <ProjectAgentChat
          activeRunId={activeRunId}
          initialMessages={initialMessages}
          mode={mode}
          onModeChange={handleModeChange}
          onSendingChange={handleSendingChange}
          project={project}
          ref={chatRef}
        />
      </Stack>
    </Paper>
  )
}
