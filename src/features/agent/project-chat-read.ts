import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { projectMemberWhere } from '@/server/project-members'

import {
  type AgentChatContext,
  formatCreditsUsed,
  formatInitialUsage
} from './project-chat-shared'

export async function handleProjectAgentChatGet(
  request: NextRequest,
  context: AgentChatContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before reading the agent chat', 401)
  }

  const { id } = await context.params
  const mode = request.nextUrl.searchParams.get('mode') === 'dev' ? 'dev' : 'use'
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id,
      members: projectMemberWhere(user.id),
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  const [chatMessages, activeRun] = await Promise.all([
    prisma.projectAgentChatMessage.findMany({
      where: {
        mode,
        projectId: project.id,
        userId: user.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100,
      select: {
        content: true,
        id: true,
        role: true,
        source: true
      }
    }),
    prisma.agentRun.findFirst({
      where: {
        mode,
        projectId: project.id,
        scope: 'project_agent',
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
  ])
  const orderedMessages = chatMessages.reverse()
  const messageIds = orderedMessages.map((message) => message.id)
  const agentUsages =
    messageIds.length > 0
      ? await prisma.agentUsage.findMany({
          where: {
            assistantMessageId: {
              in: messageIds
            },
            projectId: project.id,
            userId: user.id
          },
          select: {
            assistantMessageId: true,
            requestId: true
          }
        })
      : []
  const requestIds = agentUsages.map((usage) => usage.requestId)
  const ledgerEntries =
    requestIds.length > 0
      ? await prisma.creditLedgerEntry.findMany({
          where: {
            actorUserId: user.id,
            meterType: 'llm_tokens',
            sourceId: {
              in: requestIds
            },
            sourceType: 'agent_run'
          },
          select: {
            credits: true,
            sourceId: true
          }
        })
      : []
  const creditsByRequestId = new Map(
    ledgerEntries.map((entry) => [entry.sourceId, formatCreditsUsed(entry.credits)])
  )
  const usageByAssistantMessageId = new Map(
    agentUsages
      .filter((usage) => usage.assistantMessageId)
      .map((usage) => [
        usage.assistantMessageId,
        {
          creditsUsed: creditsByRequestId.get(usage.requestId) ?? 0
        }
      ])
  )

  return jsonOk({
    activeRunId: activeRun?.id ?? null,
    messages: orderedMessages.map((message) => ({
      content: message.content,
      id: message.id,
      role: message.role === 'user' ? 'user' : 'assistant',
      source: message.source,
      usage:
        message.role === 'assistant'
          ? formatInitialUsage(usageByAssistantMessageId.get(message.id))
          : null
    }))
  })
}
