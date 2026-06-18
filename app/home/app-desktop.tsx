'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Badge,
  Box,
  Button,
  Card,
  Center,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title
} from '@mantine/core'
import { useHover } from '@mantine/hooks'
import { Download, Store } from 'lucide-react'
import { AppIcon } from '../_components/app-icon'
import { useI18n } from '../_components/i18n-provider'
import type { ApiResponse } from '@/shared/api'

export type DesktopProject = {
  id: string
  templateId: string
  templateName: string
  slug: string
  domain: string
  url: string
  status: string
  deletedAt?: string | null
  deployError: string | null
  templateImage?: string | null
  templateUpdate?: {
    available: boolean
    currentImage: string | null
    latestImage: string | null
  }
  usage?: {
    creditsUsed: number
  } | null
}

type ProjectResult = ApiResponse<{ project: DesktopProject }>

type AppDesktopProps = {
  initialProjects: DesktopProject[]
}

const pollingStatuses = new Set(['queued', 'deploying', 'starting', 'deleting'])
const busyStatuses = new Set(['queued', 'deploying', 'starting', 'deleting'])

export function AppDesktop({ initialProjects }: AppDesktopProps) {
  const { locale, t } = useI18n()
  const [projects, setProjects] = useState(initialProjects)
  const pollingProjectIds = useMemo(
    () =>
      projects
        .filter((project) => pollingStatuses.has(project.status))
        .map((project) => project.id),
    [projects]
  )
  const pollingProjectIdsKey = pollingProjectIds.join('|')

  useEffect(() => {
    setProjects(initialProjects)
  }, [initialProjects])

  useEffect(() => {
    const projectIds = pollingProjectIdsKey.split('|').filter(Boolean)

    if (projectIds.length === 0) {
      return
    }

    let isCurrent = true

    async function refreshPendingProjects() {
      try {
        const results = await Promise.all(
          projectIds.map(async (projectId) => {
            const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`)
            const data = (await response.json()) as ProjectResult

            return response.ok && data.ok ? data.data.project : null
          })
        )

        if (!isCurrent) {
          return
        }

        const updatedProjects = results.filter((project): project is DesktopProject =>
          Boolean(project)
        )

        if (updatedProjects.length > 0) {
          setProjects((currentProjects) =>
            currentProjects.map((project) => {
              const updatedProject = updatedProjects.find(
                (candidate) => candidate.id === project.id
              )

              return updatedProject ? { ...project, ...updatedProject } : project
            })
          )
        }
      } catch {
        // Keep the current icon states until the next poll succeeds.
      }
    }

    const interval = window.setInterval(refreshPendingProjects, 2_000)
    void refreshPendingProjects()

    return () => {
      isCurrent = false
      window.clearInterval(interval)
    }
  }, [pollingProjectIdsKey])

  return (
    <Stack>
      {projects.length > 0 ? (
        <SimpleGrid aria-label={t.desktop.installedAriaLabel} cols={{ base: 1, sm: 2 }}>
          {projects.map((project) => {
            const isBusy = busyStatuses.has(project.status)
            const isDeleted = project.status === 'deleted' || Boolean(project.deletedAt)
            const isDisabled = isBusy || isDeleted
            const usageSummary = formatProjectUsageSummary(project.usage, locale)
            const hasTemplateUpdate = project.templateUpdate?.available ?? false
            const appTileContent = (
              <Stack align="center" gap="xs">
                <Box pos="relative">
                  <AppIcon templateId={project.templateId} size="large" />
                  {isBusy ? (
                    <Center
                      bg="rgba(255, 255, 255, 0.72)"
                      bottom={0}
                      left={0}
                      pos="absolute"
                      right={0}
                      top={0}
                    >
                      <Loader aria-label={t.desktop.installing} size="xs" type="dots" />
                    </Center>
                  ) : null}
                </Box>
                <Text fw={700} ta="center">
                  {project.templateName}
                </Text>
              </Stack>
            )

            return (
              <AppTileCard
                href={isDisabled ? null : `/apps/${encodeURIComponent(project.slug)}`}
                isDisabled={isDisabled}
                key={project.id}
                usageSummary={usageSummary}
              >
                <div aria-disabled={isBusy ? 'true' : undefined}>{appTileContent}</div>
                {project.deployError ? (
                  <Text c="red" size="xs" ta="center">
                    {project.deployError}
                  </Text>
                ) : null}
                {hasTemplateUpdate ? (
                  <Box
                    aria-label="Update available"
                    bg="green"
                    h={9}
                    left={12}
                    pos="absolute"
                    style={{ borderRadius: 999 }}
                    top={12}
                    w={9}
                  />
                ) : null}
              </AppTileCard>
            )
          })}
        </SimpleGrid>
      ) : (
        <Card>
          <Stack align="center" gap="sm">
            <Download size={24} />
            <Title order={3}>{t.desktop.emptyTitle}</Title>
            <Text c="dimmed" ta="center">
              {t.desktop.emptyDescription}
            </Text>
            <Button component={Link} href="/store" leftSection={<Store size={17} />}>
              {t.desktop.openStore}
            </Button>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}

function AppTileCard({
  children,
  href,
  isDisabled,
  usageSummary
}: {
  children: React.ReactNode
  href: string | null
  isDisabled: boolean
  usageSummary: {
    title: string
    total: string
  } | null
}) {
  const { hovered, ref } = useHover()

  const content = (
    <>
      {children}
      {hovered && usageSummary ? (
        <Badge pos="absolute" right={10} title={usageSummary.title} top={10}>
          {usageSummary.total}
        </Badge>
      ) : null}
    </>
  )

  if (href) {
    return (
      <Card component={Link} href={href} opacity={isDisabled ? 0.55 : 1} ref={ref}>
        {content}
      </Card>
    )
  }

  return (
    <Card opacity={isDisabled ? 0.55 : 1} ref={ref}>
      {content}
    </Card>
  )
}

function formatProjectUsageSummary(usage: DesktopProject['usage'], locale: string) {
  if (!usage) {
    return null
  }

  if (usage.creditsUsed <= 0) {
    return null
  }

  const formattedCredits = formatCredits(usage.creditsUsed, locale)

  return {
    title: `${formattedCredits} credits used`,
    total: `${formattedCredits} ₵`
  }
}

function formatCredits(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value)
}
