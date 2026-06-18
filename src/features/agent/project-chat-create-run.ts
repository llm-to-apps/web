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
  attachedFileIds,
  message,
  mode,
  project,
  requestId,
  user
}: {
  attachedFileIds: string[]
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
  const { run, userMessage } = await prisma.$transaction(async (tx) => {
    const userMessage = await tx.projectAgentChatMessage.create({
      data: {
        content: message,
        mode,
        projectId: project.id,
        role: 'user',
        source: 'user',
        userId: user.id
      },
      select: {
        id: true
      }
    })

    if (attachedFileIds.length > 0) {
      await tx.projectAgentChatMessageAttachment.createMany({
        data: attachedFileIds.map((uploadedFileId) => ({
          messageId: userMessage.id,
          projectId: project.id,
          uploadedFileId,
          userId: user.id
        }))
      })
    }

    const run = await tx.agentRun.create({
      data: {
        inputMessageId: userMessage.id,
        mode,
        model: runModel,
        payload: {
          agentToolsToken: project.agentToolsToken,
          appMcpUrl: `${appUrl}/api/mcp`,
          attachedFileIds,
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
      run,
      userMessage
    }
  })
  notifyProjectChatChanged(user.id, project.id)

  return {
    model: runModel,
    run,
    userMessage
  }
}
