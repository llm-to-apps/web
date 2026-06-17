import { prisma } from '@/server/db'
import { formatCreditsUsed, formatInitialUsage } from '@/shared/usage-format'

export async function loadHomeUserAgentChat(userId: string) {
  const userAgentMessages = await prisma.userAgentChatMessage.findMany({
    where: {
      userId
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50,
    select: {
      id: true,
      role: true,
      content: true
    }
  })
  const orderedUserAgentMessages = userAgentMessages
    .reverse()
    .filter((message) => message.role === 'assistant' || message.role === 'user')
  const activeUserAgentRun = await prisma.agentRun.findFirst({
    where: {
      scope: 'user_agent',
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
  const userAgentAssistantMessageIds = orderedUserAgentMessages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.id)
  const userAgentUsages =
    userAgentAssistantMessageIds.length > 0
      ? await prisma.agentUsage.findMany({
          where: {
            assistantMessageId: {
              in: userAgentAssistantMessageIds
            },
            projectId: null,
            userId
          },
          select: {
            assistantMessageId: true,
            requestId: true
          }
        })
      : []
  const userAgentRequestIds = userAgentUsages.map((usage) => usage.requestId)
  const userAgentLedgerEntries =
    userAgentRequestIds.length > 0
      ? await prisma.creditLedgerEntry.findMany({
          where: {
            actorUserId: userId,
            meterType: 'llm_tokens',
            sourceId: {
              in: userAgentRequestIds
            },
            sourceType: 'agent_run'
          },
          select: {
            credits: true,
            sourceId: true
          }
        })
      : []
  const userAgentCreditsByRequestId = new Map(
    userAgentLedgerEntries.map((entry) => [
      entry.sourceId,
      formatCreditsUsed(entry.credits)
    ])
  )
  const userAgentUsageByAssistantMessageId = new Map(
    userAgentUsages
      .filter((usage) => usage.assistantMessageId)
      .map((usage) => [
        usage.assistantMessageId,
        {
          creditsUsed: userAgentCreditsByRequestId.get(usage.requestId) ?? 0
        }
      ])
  )

  return {
    activeRunId: activeUserAgentRun?.id ?? null,
    messages: orderedUserAgentMessages.map((message) => ({
      id: message.id,
      role: message.role as 'assistant' | 'user',
      content: message.content,
      usage:
        message.role === 'assistant'
          ? formatInitialUsage(userAgentUsageByAssistantMessageId.get(message.id))
          : null
    }))
  }
}
