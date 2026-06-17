import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { prisma } from '@/server/db'

import { type McpContext } from './schema'
import { toolJson } from './tools'

export async function getUsageSummaryTool({
  context,
  requestId,
  startedAt,
  toolName
}: {
  context: McpContext
  requestId: string
  startedAt: number
  toolName: string
}) {
  const dbStartedAt = Date.now()
  const usage = await prisma.creditLedgerEntry.aggregate({
    where: {
      actorUserId: context.user.id,
      sourceType: 'agent_run'
    },
    _sum: {
      credits: true,
      costUsd: true
    }
  })
  const creditsUsed = Math.ceil(Math.abs(Math.min(Number(usage._sum.credits ?? 0), 0)))
  logAgentRun(
    'mcp.personal.tool.finished',
    {
      requestId,
      userId: context.user.id
    },
    {
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      toolName
    }
  )

  return toolJson({
    creditsUsed,
    estimatedCostUsd: Number(usage._sum.costUsd ?? 0)
  })
}
