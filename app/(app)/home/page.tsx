'use client'

import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { Alert, Grid, GridCol, Skeleton, Stack } from '@mantine/core'
import { AppDesktop, type DesktopProject } from '@/app/home/app-desktop'
import { UserAgentChat } from '@/app/home/user-agent-chat'
import type { ApiResponse } from '@/shared/api'

type HomeData = {
  activeRunId: string | null
  messages: ComponentProps<typeof UserAgentChat>['initialMessages']
  projects: DesktopProject[]
}

type HomeResponse = ApiResponse<HomeData>

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true

    async function loadHome() {
      const response = await fetch('/api/home', {
        cache: 'no-store'
      })
      const payload = (await response.json().catch(() => null)) as HomeResponse | null

      if (!isCurrent) {
        return
      }

      if (!response.ok || !payload || !payload.ok) {
        setError(
          payload && !payload.ok
            ? payload.error.message
            : `Failed to load home (${response.status})`
        )
        return
      }

      setData({
        activeRunId: payload.data.activeRunId,
        messages: payload.data.messages,
        projects: payload.data.projects
      })
    }

    void loadHome()

    return () => {
      isCurrent = false
    }
  }, [])

  return (
    <>
      {error ? <Alert color="red">{error}</Alert> : null}
      {!data && !error ? (
        <Grid>
          <GridCol span={{ base: 12, lg: 8 }}>
            <Stack>
              <Skeleton height={420} radius="md" />
            </Stack>
          </GridCol>
          <GridCol span={{ base: 12, lg: 4 }}>
            <Skeleton height={220} radius="md" />
          </GridCol>
        </Grid>
      ) : null}
      {data ? (
        <Grid>
          <GridCol span={{ base: 12, lg: 8 }}>
            <UserAgentChat
              activeRunId={data.activeRunId}
              initialMessages={data.messages}
            />
          </GridCol>
          <GridCol span={{ base: 12, lg: 4 }}>
            <AppDesktop initialProjects={data.projects} />
          </GridCol>
        </Grid>
      ) : null}
    </>
  )
}
