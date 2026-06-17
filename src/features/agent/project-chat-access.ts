import { prisma } from '@/server/db'
import { canUseProjectAgent, projectMemberWhere } from '@/server/project-members'

import {
  type ProjectAgentMode,
  type ProjectAgentChatProject
} from './project-chat-run-types'

export async function findProjectForAgentChat({
  mode,
  projectId,
  userId
}: {
  mode: ProjectAgentMode
  projectId: string
  userId: string
}): Promise<
  | null
  | {
      forbidden: true
      project: ProjectAgentChatProject
    }
  | {
      forbidden: false
      project: ProjectAgentChatProject
    }
> {
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id: projectId,
      members: projectMemberWhere(userId),
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      agentToolsToken: true,
      domain: true,
      id: true,
      members: {
        where: {
          userId
        },
        select: {
          role: true
        },
        take: 1
      },
      status: true,
      templateName: true,
      url: true
    }
  })

  if (!project) {
    return null
  }

  const memberRole = project.members[0]?.role

  if (!memberRole || !canUseProjectAgent(memberRole, mode)) {
    return {
      forbidden: true,
      project
    }
  }

  return {
    forbidden: false,
    project
  }
}
