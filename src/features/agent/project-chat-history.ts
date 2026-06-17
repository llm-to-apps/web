import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { projectAgentMemoryIds } from '@/server/agent/memory-ids'
import { deleteMastraMemoryThread } from '@/server/agent/mastra-memory'
import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'
import { publishProjectChatChanged } from '@/server/agent/project-chat-events'
import { jsonErrorMessage, jsonOk } from '@/server/http'

type ProjectAgentChatHistoryContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function handleProjectAgentChatHistoryDelete(
  request: NextRequest,
  context: ProjectAgentChatHistoryContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before clearing chat history', 401)
  }

  const { id } = await context.params
  const mode = request.nextUrl.searchParams.get('mode') === 'dev' ? 'dev' : 'use'
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id,
      members: projectMemberWhere(user.id, 'edit')
    },
    select: {
      id: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      projectId: project.id,
      mode,
      scope: 'project_agent',
      status: {
        in: ['queued', 'running']
      },
      userId: user.id
    },
    select: {
      id: true
    }
  })

  if (activeRun) {
    return jsonErrorMessage('Wait until the agent finishes before clearing history', 409)
  }

  const memoryIds = projectAgentMemoryIds(user.id, project.id, mode)

  await deleteMastraMemoryThread({
    agentId: mode === 'dev' ? 'projectDevAgent' : 'projectUseAgent',
    ...memoryIds
  })
  await prisma.projectAgentChatMessage.deleteMany({
    where: {
      mode,
      projectId: project.id,
      userId: user.id
    }
  })
  publishProjectChatChanged(user.id, project.id).catch(() => undefined)

  return jsonOk()
}
