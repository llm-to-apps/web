import { prisma } from '@/server/db'
import { formatCreditsUsed, formatInitialUsage } from '@/shared/usage-format'

export async function loadWorkspaceChat({
  mode,
  projectId,
  userId
}: {
  mode: 'dev' | 'use'
  projectId: string
  userId: string
}) {
  const chatMessages = await prisma.projectAgentChatMessage.findMany({
    where: {
      mode,
      projectId,
      userId
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 100,
    select: {
      attachments: {
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          uploadedFile: {
            select: {
              error: true,
              id: true,
              originalName: true,
              sizeBytes: true,
              status: true
            }
          }
        }
      },
      id: true,
      role: true,
      source: true,
      content: true
    }
  })
  const orderedChatMessages = chatMessages.reverse()
  const activeProjectAgentRun = await prisma.agentRun.findFirst({
    where: {
      projectId,
      mode,
      scope: 'project_agent',
      status: {
        in: ['queued', 'running']
      },
      userId
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true
    }
  })
  const chatMessageIds = orderedChatMessages.map((message) => message.id)
  const agentUsages =
    chatMessageIds.length > 0
      ? await prisma.agentUsage.findMany({
          where: {
            assistantMessageId: {
              in: chatMessageIds
            },
            projectId,
            userId
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
            actorUserId: userId,
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

  return {
    activeRunId: activeProjectAgentRun?.id ?? null,
    messages: orderedChatMessages.map((message) => ({
      id: message.id,
      role: message.role === 'user' ? 'user' : 'assistant',
      source: message.source,
      attachments: message.attachments.map((attachment) => ({
        error: attachment.uploadedFile.error,
        id: attachment.uploadedFile.id,
        name: attachment.uploadedFile.originalName,
        sizeBytes: attachment.uploadedFile.sizeBytes,
        status: attachment.uploadedFile.status
      })),
      content: message.content,
      usage:
        message.role === 'assistant'
          ? formatInitialUsage(usageByAssistantMessageId.get(message.id))
          : null
    }))
  }
}
