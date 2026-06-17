import { type CurrentUser } from '@/server/auth'
import { ensureAuthToken } from '@/server/auth/tokens'
import { prisma } from '@/server/db'
import { projectDevAgentModel, projectUseAgentModel } from '@/server/env'

import { notifyProjectChatChanged } from './project-chat-shared'
import {
  type ProjectAgentChatProject,
  type ProjectAgentMode
} from './project-chat-run-types'

export async function createQueuedProjectAgentRun({
  message,
  mode,
  project,
  requestId,
  user
}: {
  message: string
  mode: ProjectAgentMode
  project: ProjectAgentChatProject
  requestId: string
  user: CurrentUser
}) {
  const appUrl = project.url.replace(/\/$/, '')
  const runModel = mode === 'dev' ? projectDevAgentModel() : projectUseAgentModel()
  const projectUserToken =
    mode === 'use'
      ? await ensureAuthToken({
          name: `${project.templateName} MCP`,
          projectId: project.id,
          scope: 'project:mcp',
          subjectType: 'user',
          userId: user.id
        })
      : null
  const userMessage = await prisma.projectAgentChatMessage.create({
    data: {
      content: message,
      mode,
      projectId: project.id,
      role: 'user',
      source: 'user',
      userId: user.id
    }
  })
  notifyProjectChatChanged(user.id, project.id)
  const run = await prisma.agentRun.create({
    data: {
      inputMessageId: userMessage.id,
      mode,
      model: runModel,
      payload: {
        agentToolsToken: project.agentToolsToken,
        appMcpUrl: `${appUrl}/api/mcp`,
        domain: project.domain,
        message,
        projectUserToken: projectUserToken?.token ?? null,
        projectName: project.templateName,
        status: project.status,
        toolsUrl: `${appUrl}/agent-tools`
      },
      projectId: project.id,
      requestId,
      scope: 'project_agent',
      status: 'queued',
      userId: user.id
    },
    select: {
      id: true
    }
  })

  return {
    model: runModel,
    run,
    userMessage
  }
}
