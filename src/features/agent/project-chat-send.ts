import { NextRequest } from 'next/server'

import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'

import { type AgentChatContext } from './project-chat-shared'
import { parseProjectChatSendInput } from './project-chat-send-input'
import {
  createQueuedProjectAgentRun,
  enqueueAgentRun,
  findActiveProjectAgentRun,
  findProjectForAgentChat
} from './project-chat-run'

export async function handleProjectAgentChatPost(
  request: NextRequest,
  context: AgentChatContext
) {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before chatting with the agent', 401)
  }

  const { id } = await context.params
  const input = await parseProjectChatSendInput(request).catch((error) => error)

  if (input instanceof Error) {
    return jsonValidationError(input)
  }

  const { message, mode } = input
  logAgentRun(
    'api.chat.received',
    {
      projectId: id,
      requestId,
      scope: 'project_agent',
      userId: user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      messageLength: message.length
    }
  )

  const projectAccess = await findProjectForAgentChat({
    mode,
    projectId: id,
    userId: user.id
  })

  if (!projectAccess) {
    return jsonErrorMessage('Application not found', 404)
  }

  if (projectAccess.forbidden) {
    return jsonErrorMessage('You do not have permission to use this project agent', 403)
  }

  const { project } = projectAccess
  const activeRun = await findActiveProjectAgentRun({
    mode,
    projectId: project.id,
    userId: user.id
  })

  if (activeRun) {
    logAgentRun(
      'api.chat.active_run',
      {
        projectId: project.id,
        requestId,
        runId: activeRun.id,
        scope: 'project_agent',
        userId: user.id
      },
      {
        elapsedMs: elapsedSince(startedAt)
      }
    )
    return jsonOk({
      active: true,
      runId: activeRun.id
    })
  }

  const {
    model: runModel,
    run,
    userMessage
  } = await createQueuedProjectAgentRun({
    message,
    mode,
    project,
    requestId,
    user
  })
  logAgentRun(
    'api.chat.run_created',
    {
      projectId: project.id,
      requestId,
      runId: run.id,
      scope: 'project_agent',
      userId: user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      model: runModel,
      mode,
      userMessageId: userMessage.id
    }
  )

  await enqueueAgentRun(run.id)
  logAgentRun(
    'api.chat.job_enqueued',
    {
      projectId: project.id,
      requestId,
      runId: run.id,
      scope: 'project_agent',
      userId: user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      mode
    }
  )

  return jsonOk({
    runId: run.id,
    userMessageId: userMessage.id
  })
}
