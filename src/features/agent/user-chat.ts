import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { userAgentModel } from '@/server/env'
import { getAgentRunQueue } from '@/server/agent/run-queue'
import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'
import { platformBaseUrl } from '@/server/request-origin'
import { parseJsonRequest } from '@/shared/schema'
import { userAgentChatRequestSchema } from './schema'

export async function handleUserAgentChatPost(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before chatting with the agent', 401)
  }

  let body

  try {
    body = await parseJsonRequest(request, userAgentChatRequestSchema)
  } catch (error) {
    return jsonValidationError(error)
  }

  const message = body.message
  const attachedFileIds = Array.from(new Set(body.attachedFileIds))
  logAgentRun(
    'api.chat.received',
    {
      requestId,
      scope: 'user_agent',
      userId: user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      messageLength: message.length
    }
  )

  if (attachedFileIds.length > 0) {
    const attachedFiles = await prisma.uploadedFile.findMany({
      where: {
        id: {
          in: attachedFileIds
        },
        scope: 'user_agent',
        userId: user.id
      },
      select: {
        id: true,
        status: true
      }
    })
    const attachedFileStatuses = new Map(
      attachedFiles.map((file) => [file.id, file.status])
    )
    const invalidFileId = attachedFileIds.find((fileId) => !attachedFileStatuses.has(fileId))

    if (invalidFileId) {
      return jsonErrorMessage('Attached file is unavailable', 400)
    }

    const pendingFileId = attachedFileIds.find(
      (fileId) => attachedFileStatuses.get(fileId) !== 'processed'
    )

    if (pendingFileId) {
      return jsonErrorMessage('Wait for attached file indexing to finish', 409)
    }
  }

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      scope: 'user_agent',
      status: {
        in: ['queued', 'running']
      },
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true
    }
  })

  if (activeRun) {
    logAgentRun(
      'api.chat.active_run',
      {
        requestId,
        runId: activeRun.id,
        scope: 'user_agent',
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

  const personalMcpUrl = new URL('/api/mcp/personal', platformBaseUrl()).toString()
  const { run, userMessage } = await prisma.$transaction(async (tx) => {
    const userMessage = await tx.userAgentChatMessage.create({
      data: {
        content: message,
        role: 'user',
        userId: user.id
      },
      select: {
        id: true
      }
    })

    if (attachedFileIds.length > 0) {
      await tx.userAgentChatMessageAttachment.createMany({
        data: attachedFileIds.map((uploadedFileId) => ({
          messageId: userMessage.id,
          uploadedFileId,
          userId: user.id
        }))
      })
    }

    const run = await tx.agentRun.create({
      data: {
        inputMessageId: userMessage.id,
        mode: 'use',
        model: userAgentModel(),
        payload: {
          attachedFileIds,
          message,
          personalMcpUrl,
          userEmail: user.email
        },
        requestId,
        scope: 'user_agent',
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
  logAgentRun(
    'api.chat.run_created',
    {
      requestId,
      runId: run.id,
      scope: 'user_agent',
      userId: user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      userMessageId: userMessage.id
    }
  )

  await getAgentRunQueue().add(
    'run-agent',
    {
      runId: run.id
    },
    {
      jobId: run.id
    }
  )
  logAgentRun(
    'api.chat.job_enqueued',
    {
      requestId,
      runId: run.id,
      scope: 'user_agent',
      userId: user.id
    },
    {
      elapsedMs: elapsedSince(startedAt)
    }
  )

  return jsonOk({
    runId: run.id,
    userMessageId: userMessage.id
  })
}
