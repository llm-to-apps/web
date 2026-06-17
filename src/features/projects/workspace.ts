import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage } from '@/server/http'
import {
  findWorkspaceProject,
  loadWorkspaceChat,
  loadWorkspaceUsageSummary
} from './workspace-query'

type ProjectWorkspaceContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function handleProjectWorkspaceGet(
  request: NextRequest,
  context: ProjectWorkspaceContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before viewing applications', 401)
  }

  if (!user.onboarded) {
    return jsonErrorMessage('Complete onboarding first', 403)
  }

  const { id } = await context.params
  const mode = request.nextUrl.searchParams.get('mode') === 'dev' ? 'dev' : 'use'
  const project = await findWorkspaceProject({
    projectIdOrSlug: id,
    userId: user.id
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  const [chat, usageSummary] = await Promise.all([
    loadWorkspaceChat({
      mode,
      projectId: project.id,
      userId: user.id
    }),
    loadWorkspaceUsageSummary({
      projectId: project.id,
      userId: user.id
    })
  ])
  const appUrl = project.url.replace(/\/$/, '')
  const devUrl = (project.devUrl ?? createDevUrl(appUrl)).replace(/\/$/, '')
  const activeAppUrl = mode === 'dev' ? devUrl : appUrl

  return NextResponse.json({
    ok: true,
    activeRunId: chat.activeRunId,
    appOrigin: new URL(activeAppUrl).origin,
    messages: chat.messages,
    project: {
      appUrl: project.url,
      deployError: project.deployError,
      devUrl,
      domain: project.domain,
      devDomain: project.devDomain,
      id: project.id,
      name: project.templateName,
      status: project.status,
      toolsUrl: `${appUrl}/agent-tools`
    },
    usageSummary
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
