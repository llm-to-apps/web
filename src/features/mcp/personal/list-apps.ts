import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'

import { type McpContext } from './schema'
import { toolJson } from './tools'

export async function listPersonalAppsTool({
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
  const apps = await prisma.project.findMany({
    where: {
      members: projectMemberWhere(context.user.id),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true,
      templateId: true,
      templateName: true,
      domain: true,
      url: true,
      status: true,
      deployError: true
    }
  })
  logAgentRun(
    'mcp.personal.tool.finished',
    {
      requestId,
      userId: context.user.id
    },
    {
      appCount: apps.length,
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      toolName
    }
  )

  return toolJson({
    apps
  })
}
