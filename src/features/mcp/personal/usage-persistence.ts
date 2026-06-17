import { billAgentUsage } from '@/server/billing'
import { prisma } from '@/server/db'

import { type TokenUsage } from './schema'

export async function persistPersonalMcpAgentUsage({
  assistantMessageId,
  model,
  mode,
  projectId,
  requestId,
  usage,
  userId,
  userMessageId
}: {
  assistantMessageId: string
  model: string
  mode: 'use'
  projectId: string
  requestId: string
  usage: TokenUsage
  userId: string
  userMessageId: string
}) {
  await prisma.agentUsage.create({
    data: {
      assistantMessageId,
      completionTokens: usage.completionTokens ?? null,
      mode,
      model,
      projectId,
      promptTokens: usage.promptTokens ?? null,
      requestId,
      totalTokens: usage.totalTokens ?? null,
      userId,
      userMessageId
    }
  })
  await billAgentUsage({
    actorUserId: userId,
    model,
    projectId,
    requestId,
    usage
  })
}
