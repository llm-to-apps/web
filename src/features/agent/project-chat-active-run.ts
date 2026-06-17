import { prisma } from '@/server/db'

import { type ProjectAgentMode } from './project-chat-run-types'

export async function findActiveProjectAgentRun({
  mode,
  projectId,
  userId
}: {
  mode: ProjectAgentMode
  projectId: string
  userId: string
}) {
  return prisma.agentRun.findFirst({
    where: {
      mode,
      projectId,
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
}
