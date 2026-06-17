import http from 'node:http'
import https from 'node:https'

import { projectMemberWhere } from '@/server/project-members'
import { appError, appOk, type AppResult } from '@/shared/result'
import { prisma } from '@/server/db'
import { appReadyBaseUrl } from '@/server/env'

export type ProjectRuntimeStatus = {
  project: {
    id: string
    status: string
  }
  prod: {
    ready: boolean
    url: string
  }
  dev: {
    ready: boolean
    url: string
  }
}

export async function getProjectRuntimeStatus({
  projectIdOrSlug,
  userId
}: {
  projectIdOrSlug: string
  userId: string
}): Promise<AppResult<ProjectRuntimeStatus>> {
  const project = await prisma.project.findFirst({
    where: {
      OR: [
        {
          id: projectIdOrSlug
        },
        {
          slug: projectIdOrSlug
        }
      ],
      members: projectMemberWhere(userId),
      deletedAt: null
    },
    select: {
      devDomain: true,
      id: true,
      domain: true,
      status: true,
      devUrl: true,
      url: true
    }
  })

  if (!project) {
    return appError('NOT_FOUND', 'Application not found')
  }

  const prodUrl = project.url.replace(/\/$/, '')
  const devUrl = (project.devUrl ?? createDevUrl(prodUrl)).replace(/\/$/, '')
  const devHost = project.devDomain ?? new URL(devUrl).host
  const [prodReady, devReady] = await Promise.all([
    isRuntimeReady(project.domain),
    isRuntimeReady(devHost)
  ])

  return appOk({
    project: {
      id: project.id,
      status: project.status
    },
    prod: {
      ready: prodReady,
      url: prodUrl
    },
    dev: {
      ready: devReady,
      url: devUrl
    }
  })
}

export function readProjectId(params: unknown) {
  if (
    params &&
    typeof params === 'object' &&
    'id' in params &&
    typeof params.id === 'string'
  ) {
    return params.id
  }

  return null
}

async function isRuntimeReady(host: string) {
  try {
    const response = await requestRuntimeHealth(host)

    return response.status >= 200 && response.status < 400
  } catch {
    return false
  }
}

function requestRuntimeHealth(host: string) {
  return new Promise<{ status: number }>((resolve, reject) => {
    const baseUrl = new URL(appReadyBaseUrl())
    const healthPath = new URL('/api/health', baseUrl)
    const client = healthPath.protocol === 'https:' ? https : http
    const request = client.request(
      {
        headers: {
          Host: host
        },
        hostname: healthPath.hostname,
        method: 'GET',
        path: `${healthPath.pathname}${healthPath.search}`,
        port: healthPath.port || undefined,
        protocol: healthPath.protocol,
        timeout: 1500
      },
      (response) => {
        response.resume()

        resolve({
          status: response.statusCode ?? 0
        })
      }
    )

    request.on('timeout', () => {
      request.destroy(new Error('Runtime health request timed out'))
    })
    request.on('error', reject)
    request.end()
  })
}

function createDevUrl(appUrl: string) {
  const url = new URL(appUrl)
  url.port = '4046'
  url.pathname = '/'
  url.search = ''
  url.hash = ''

  return url.toString().replace(/\/$/, '')
}
